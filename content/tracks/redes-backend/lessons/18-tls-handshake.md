> **Em uma frase:** o TLS 1.2 gasta 2 RTTs de handshake antes do primeiro byte de HTTP, o TLS 1.3 gasta 1 (e criptografa o certificado), e o 0-RTT elimina mais um ao custo de aceitar o risco de replay, por isso só serve para requisições idempotentes.

## O problema

Uma API de catálogo atende usuários de várias regiões, e o time de plataforma quer cortar a latência de abertura de conexão. Medições mostram **480 ms** até a primeira resposta para usuários a 120 ms de RTT, em conexão nova. Ao ativar o TLS 1.3, o número cai para 360 ms; com 0-RTT numa rota de leitura, para 240 ms. Mas num endpoint de pagamento, alguém propõe ativar o 0-RTT "porque é mais rápido", e uma revisão de segurança o barra: **a requisição pode ser repetida por quem estiver na rede**.

Saber contar os RTTs de cada versão, e saber **quando** o 0-RTT é seguro, é o que separa uma otimização de uma vulnerabilidade.

## Como funciona

O TLS roda sobre o TCP e acrescenta **confidencialidade**, **integridade** e **autenticação** do servidor (por certificado). Antes de trocar dados, cliente e servidor precisam combinar a versão, os algoritmos e uma chave secreta compartilhada.

### TLS 1.2: 2 RTTs

1. **Ida e volta 1:** o cliente envia o `ClientHello` (versões, suítes de cifras, um número aleatório). O servidor responde `ServerHello` (suíte escolhida), `Certificate`, `ServerKeyExchange` (sua parte da troca de chaves) e `ServerHelloDone`.
2. **Ida e volta 2:** o cliente valida o certificado, envia o `ClientKeyExchange`, o `ChangeCipherSpec` e o `Finished`; o servidor responde com o seu `ChangeCipherSpec` e `Finished`.
3. Só então a requisição HTTP segue, criptografada.

Contando o TCP (1 RTT) e a requisição com a resposta (1 RTT), a **resposta chega no 4º RTT**. Com 120 ms de RTT, são 480 ms.

### TLS 1.3: 1 RTT

O TLS 1.3 corta uma ida e volta com uma aposta: o cliente **adivinha** o grupo de troca de chaves (x25519 é quase universal) e já envia a sua **`key_share`** no `ClientHello`. O servidor responde com a dele e **o resto do handshake já criptografado** (certificado, assinatura, `Finished`). O cliente conclui e manda o seu `Finished` **junto com a primeira requisição**. A resposta chega no **3º RTT** (TCP + TLS + HTTP), ou 360 ms.

Outras mudanças do TLS 1.3:

- **Certificado criptografado:** observadores deixam de ver o certificado do servidor (o SNI, porém, continua em claro, aula 19).
- **Só suítes modernas:** AEAD (AES-GCM, ChaCha20-Poly1305) e troca de chaves efêmera (ECDHE). Foram removidos RSA estático, CBC, RC4 e compressão.
- **Forward secrecy obrigatório:** as chaves efêmeras são descartadas depois, então roubar a chave privada do certificado no futuro **não decifra tráfego antigo**.

### Retomada por ticket

Ao fim do handshake, o servidor pode enviar um **ticket de sessão**. Numa nova conexão, o cliente o apresenta no `ClientHello` (*pre-shared key*) e o servidor **dispensa o certificado e a assinatura**. O handshake continua em 1 RTT, mas com menos bytes e menos CPU.

### 0-RTT e o risco de replay

Com um ticket que permite **early data**, o cliente envia a requisição **dentro do primeiro voo**. O servidor responde sem esperar o fim do handshake: **2 RTTs** até a resposta numa conexão TCP nova (1 TCP + 1 de requisição). Em QUIC, onde não há handshake TCP, 0-RTT significa resposta em 1 RTT.

O custo: os dados do 0-RTT **não têm proteção contra repetição**. Um atacante que captura o primeiro voo pode reenviá-lo, ao servidor ou a outro do mesmo cluster, e a requisição roda duas vezes. Também não há forward secrecy completo para esses dados. As regras de uso:

- Só para requisições **idempotentes** (`GET` de leitura). Nunca para pagamento, criação de pedido, mudança de senha.
- O servidor (ou o CDN) pode **rejeitar** o early data em endpoints sensíveis; a resposta **425 Too Early** (RFC 8470) instrui o cliente a refazer após o handshake.
- Muitos servidores deixam o 0-RTT **desligado por padrão**.

| Cenário | TCP | TLS | Requisição | Total |
|---|---|---|---|---|
| TLS 1.2, conexão nova | 1 | 2 | 1 | 4 |
| TLS 1.3, conexão nova | 1 | 1 | 1 | 3 |
| TLS 1.3, 0-RTT | 1 | 0 | 1 | 2 |
| Conexão reaproveitada | 0 | 0 | 1 | 1 |

A última linha é a que mais importa: **reaproveitar a conexão** elimina o handshake inteiro.

## Na prática

O programa abaixo conecta a um servidor e força cada versão, mostrando o que foi negociado. O `SNIHostName` coloca o nome no `ClientHello` (aula 19).

```java
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import java.util.List;

public class Tls {
    static void testar(String host, String protocolo) throws Exception {
        try (SSLSocket s = (SSLSocket) SSLSocketFactory.getDefault().createSocket(host, 443)) {
            SSLParameters p = s.getSSLParameters();
            p.setProtocols(new String[] {protocolo});
            p.setServerNames(List.of(new SNIHostName(host)));   // SNI: vai em claro no ClientHello
            s.setSSLParameters(p);
            long t0 = System.nanoTime();
            s.startHandshake();
            long ms = (System.nanoTime() - t0) / 1_000_000;
            System.out.println(protocolo + " -> negociado " + s.getSession().getProtocol()
                    + ", suíte " + s.getSession().getCipherSuite() + ", handshake " + ms + " ms");
        }
    }

    public static void main(String[] args) throws Exception {
        String host = args.length > 0 ? args[0] : "example.com";
        testar(host, "TLSv1.3");
        testar(host, "TLSv1.2");
    }
}
```

Uma execução contra `example.com` imprimiu `TLSv1.3 -> negociado TLSv1.3, suíte TLS_AES_256_GCM_SHA384` e `TLSv1.2 -> negociado TLSv1.2, suíte TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256`. Os tempos de handshake impressos (algumas centenas de ms) têm **muito ruído**: a primeira chamada paga carga de classes e inicialização do provedor de criptografia, então o TLS 1.2 pode parecer mais rápido por acidente. Para medir a diferença real, repita muitas vezes e compare a mediana, ou use `curl -w '%{time_appconnect}'`.

Ferramentas de linha de comando: `openssl s_client -connect host:443 -tls1_3` mostra o protocolo, a suíte e a cadeia de certificados; `-tls1_2` força a versão; `curl -v --tlsv1.2 --tls-max 1.2 https://host/` lista as mensagens do handshake. No servidor, restringir versões é configuração (por exemplo, `ssl_protocols TLSv1.2 TLSv1.3;` no nginx), e em Java, `SSLParameters.setProtocols` ou `-Djdk.tls.client.protocols=TLSv1.3`.

## Armadilhas comuns

- **Ativar 0-RTT em endpoints com efeito colateral.** O replay executa a operação duas vezes. Só para leituras idempotentes, e com `Too Early` (425) para o resto.
- **Manter TLS 1.0 e 1.1 habilitados.** Estão obsoletos (RFC 8996) e atraem falhas de conformidade. O piso razoável é o TLS 1.2.
- **Medir o handshake com uma única chamada.** Ruído de inicialização distorce o resultado. Repita e compare medianas.
- **Achar que TLS 1.3 esconde tudo.** O SNI e o IP continuam visíveis; o certificado, não.
- **Abrir conexões TLS novas por requisição.** Cada uma paga 1 a 2 RTTs e CPU de criptografia assimétrica. Pool e keep-alive resolvem.
- **Suítes sem forward secrecy no TLS 1.2.** RSA estático permite decifrar tráfego antigo se a chave vazar. Prefira suítes ECDHE.
- **Terminar TLS em um balanceador e assumir segurança até o fim.** O trecho balanceador → servidor pode ficar em claro; decida se isso é aceitável (aula 26).

## Checklist de domínio

- [ ] Você conta os RTTs do handshake TLS 1.2 e TLS 1.3 e os RTTs totais até a resposta HTTP
- [ ] Você explica a aposta da `key_share` que permite ao TLS 1.3 fechar em 1 RTT
- [ ] Você descreve forward secrecy e por que as chaves efêmeras o garantem
- [ ] Você explica a retomada por ticket e o que ela dispensa (o certificado)
- [ ] Você explica o 0-RTT, o risco de replay e quando é seguro usá-lo
- [ ] Você sabe forçar e inspecionar versões de TLS com `openssl s_client`, `curl` e `SSLParameters`

## Para ir além

- [RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [RFC 5246: TLS Protocol Version 1.2](https://www.rfc-editor.org/rfc/rfc5246)
- [RFC 8470: Using Early Data in HTTP](https://www.rfc-editor.org/rfc/rfc8470)
- [RFC 8996: Deprecating TLS 1.0 and TLS 1.1](https://www.rfc-editor.org/rfc/rfc8996)
- [Javadoc: javax.net.ssl.SSLParameters](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/javax/net/ssl/SSLParameters.html)
