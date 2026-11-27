> **Em uma frase:** clicar num link dispara uma cadeia em que cada fase depende da anterior, DNS, handshake TCP, handshake TLS, requisição HTTP e resposta, e o tempo até a página aparecer é a soma dessas fases; saber qual delas custa quanto (e quais um cache ou uma conexão reaproveitada elimina) é o que orienta qualquer otimização de latência.

## O problema

Uma página abre em 160 ms para quem está perto e em 700 ms para quem está longe, e o time de frontend e o de backend discordam sobre o culpado. O backend mede 20 ms no servidor; o frontend mede o carregamento total; ninguém tem o mapa das fases no meio. Sem esse mapa, qualquer otimização é palpite: trocar de CDN, comprimir mais, mexer no banco.

Esta aula costura tudo o que a trilha ensinou numa única linha do tempo. Ela vale como roteiro de entrevista ("o que acontece quando eu digito um endereço no navegador?") e como roteiro de diagnóstico.

## Como funciona

Cenário: o usuário abre `https://www.exemplo.com/` no navegador, que ainda não conhece o site. O RTT até o servidor é de **30 ms** e o resolvedor DNS leva **40 ms** para responder a um nome que não está em cache.

### 0. Antes da rede

O navegador consulta o que já sabe: a lista **HSTS** (se o site deve usar HTTPS), o cache de DNS dele, o cache HTTP e um pool de conexões abertas. Se há uma conexão aquecida para o host, pula direto para a requisição. Aqui, não há nada disso.

### 1. DNS: 40 ms

Resolver `www.exemplo.com` (aula 17): uma consulta UDP ao resolvedor do sistema, que, sem cache, consulta a hierarquia (raiz, TLD, autoritativo) e devolve um registro **A** (ou **AAAA**) com o seu TTL. O pacote sai pelo gateway padrão (aula 7), depois de um ARP para descobrir o MAC dele (aula 6), e o roteador de borda traduz o endereço com NAT (aula 8).

### 2. TCP: 1 RTT, 30 ms

O navegador abre uma conexão com `203.0.113.10:443` (aula 11): SYN, SYN-ACK e ACK. Só depois de uma ida e volta completa dá para enviar dados.

### 3. TLS 1.3: 1 RTT, 30 ms

O `ClientHello` leva o nome do site em **SNI** (aula 19) e a chave efêmera do cliente; a resposta traz o `ServerHello`, o certificado e o `Finished` (aula 18). O navegador valida a cadeia de certificados e o nome, e envia o seu `Finished`. Com TLS 1.2 seriam 2 RTTs.

### 4. HTTP: 1 RTT mais o tempo do servidor, 50 ms

O `GET /` vai junto com o `Finished` do cliente. O servidor trabalha **20 ms** (aplicação, banco) e a resposta leva meia ida e volta. O **primeiro byte** (TTFB) chega 30 ms (RTT) mais 20 ms (servidor) depois do `GET`: 50 ms.

### 5. O corpo e o resto da página: 10 ms

O restante do HTML chega em mais 10 ms. Ao ler o HTML, o navegador descobre dezenas de recursos (CSS, JavaScript, imagens, fontes) e os pede **pela mesma conexão**, em paralelo, graças à multiplexação do HTTP/2 (aula 20), sem novos handshakes se o host for o mesmo.

### A soma

| Fase | Tempo | Aula |
|---|---|---|
| DNS | 40 ms | 17 |
| TCP | 30 ms | 11 |
| TLS 1.3 | 30 ms | 18 e 19 |
| HTTP até o primeiro byte | 50 ms | 20 |
| Resto do corpo | 10 ms | 14 |
| **Total até o HTML completo** | **160 ms** | |

Os números são ilustrativos, mas a estrutura é real: **três RTTs de rede antes do primeiro byte útil** (TCP, TLS e a requisição), mais o DNS e o tempo do servidor.

## Na prática

O programa abaixo, completo, mede cada fase contra um site real: DNS, TCP, TLS e o primeiro byte da resposta, usando só o JDK:

```java
import java.io.*;
import java.net.*;
import javax.net.ssl.*;

public class FasesDoClique {
    public static void main(String[] args) throws Exception {
        String host = args.length > 0 ? args[0] : "example.com";

        long t0 = System.nanoTime();
        InetAddress ip = InetAddress.getByName(host);                 // 1) DNS
        long t1 = System.nanoTime();

        try (Socket tcp = new Socket()) {
            tcp.connect(new InetSocketAddress(ip, 443), 5000);        // 2) handshake TCP
            long t2 = System.nanoTime();

            SSLSocketFactory f = (SSLSocketFactory) SSLSocketFactory.getDefault();
            try (SSLSocket tls = (SSLSocket) f.createSocket(tcp, host, 443, true)) {   // SNI = host
                tls.startHandshake();                                 // 3) handshake TLS
                long t3 = System.nanoTime();

                OutputStream out = tls.getOutputStream();
                out.write(("GET / HTTP/1.1\r\nHost: " + host + "\r\nConnection: close\r\n\r\n").getBytes());
                out.flush();
                InputStream in = tls.getInputStream();
                int primeiro = in.read();                             // 4) primeiro byte da resposta
                long t4 = System.nanoTime();
                in.readAllBytes();                                    // 5) resto do corpo
                long t5 = System.nanoTime();

                System.out.println("protocolo TLS: " + tls.getSession().getProtocol() + ", primeiro byte lido: " + (char) primeiro);
                System.out.printf("DNS            %7.1f ms%n", (t1 - t0) / 1e6);
                System.out.printf("TCP            %7.1f ms%n", (t2 - t1) / 1e6);
                System.out.printf("TLS            %7.1f ms%n", (t3 - t2) / 1e6);
                System.out.printf("1o byte (HTTP) %7.1f ms%n", (t4 - t3) / 1e6);
                System.out.printf("corpo restante %7.1f ms%n", (t5 - t4) / 1e6);
                System.out.printf("total          %7.1f ms%n", (t5 - t0) / 1e6);
            }
        }
    }
}
```

Na execução, o programa imprimiu `protocolo TLS: TLSv1.3` e a lista de tempos; **os valores mudam muito** com a rede, o horário, o cache do resolvedor e a distância do servidor, então rode-o algumas vezes e observe a proporção entre as fases, e não os números absolutos. Na primeira execução o TLS inclui trabalho a mais de inicialização da JVM e de validação do certificado, então não o compare diretamente com o RTT.

Para a mesma decomposição no terminal, o `curl` expõe os tempos de cada fase:

```bash
curl -s -o /dev/null https://www.exemplo.com/ -w 'dns %{time_namelookup}  tcp %{time_connect}  tls %{time_appconnect}  ttfb %{time_starttransfer}  total %{time_total}\n'
```

Os valores são **acumulados**: `time_connect` inclui o DNS, `time_appconnect` inclui o TCP, e assim por diante. A subtração entre campos dá cada fase.

### Como encurtar cada fase

- **DNS:** cache do navegador, do sistema e do resolvedor; TTL adequado; `<link rel="dns-prefetch">`.
- **TCP e TLS:** reaproveitar conexões (keep-alive e pool, aula 23), `<link rel="preconnect">`, TLS 1.3 e retomada de sessão (0-RTT com cuidado), e um **CDN** perto do usuário, que reduz o RTT de todas as fases.
- **HTTP/3:** o QUIC junta o handshake de transporte e o de segurança em 1 RTT.
- **Servidor:** cache, consultas mais rápidas, compressão. Só ataca a fase de 20 ms.

Num segundo clique no mesmo site, com a conexão aberta e o DNS em cache, sobram só a requisição e a resposta: **50 ms** mais o corpo, e não 160.

## Armadilhas comuns

- **Otimizar o servidor quando o custo está nos RTTs.** Reduzir 20 ms para 10 ms ajuda menos que eliminar um handshake.
- **Medir só a primeira visita.** Os caches e as conexões abertas mudam tudo nas visitas seguintes: meça os dois casos.
- **Esquecer o DNS.** Nomes sem cache e TTLs de poucos segundos repetem uma fase de dezenas de milissegundos.
- **Domínios demais.** Cada host novo paga DNS, TCP e TLS de novo.
- **Ler os tempos do curl como duração de cada fase.** São acumulados desde o início.
- **Achar que o RTT é só "internet lenta".** A distância física até o servidor é um piso que só o CDN e a replicação reduzem.

## Checklist de domínio

- [ ] Você descreve a cadeia: caches, DNS, TCP, TLS, HTTP e a resposta, citando a aula de cada fase
- [ ] Você soma os tempos de uma visita fria e explica os três RTTs antes do primeiro byte
- [ ] Você diz o que muda numa visita seguinte: DNS em cache e conexão reaproveitada
- [ ] Você mede cada fase com `curl -w` e sabe que os campos são acumulados
- [ ] Você escolhe a otimização certa para cada fase: cache, preconnect, TLS 1.3, HTTP/3, CDN
- [ ] Você narra a história em dois minutos, como numa entrevista

## Para ir além

- [web.dev: Preconnect e dns-prefetch](https://web.dev/articles/preconnect-and-dns-prefetch)
- [MDN: Navigation Timing e as fases da navegação](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Navigation_timing)
- [curl: variáveis do --write-out](https://curl.se/docs/manpage.html#-w)
- [RFC 9114: HTTP/3](https://www.rfc-editor.org/rfc/rfc9114)
