> **Em uma frase:** uma requisição não viaja "pela internet" em um salto só: atravessa Wi-Fi, provedor, roteadores e data center, e o tempo total é a soma de trechos que você mede, separa e, em parte, não consegue vencer porque a luz tem velocidade finita.

## O problema

Um endpoint responde em 12 ms no teste local e em 180 ms em produção, para o mesmo usuário. O time abre o código, procura um `N+1`, otimiza uma query e a diferença quase não muda. Depois descobre que o servidor estava a 7.700 km do cliente e que a requisição precisava de **três idas e voltas** (TCP, TLS e HTTP) antes de entregar o primeiro byte. Nenhum índice de banco resolveria isso.

Backend sem noção de rede diagnostica lentidão no lugar errado. Esta aula dá o vocabulário mínimo para dividir qualquer latência em partes e saber qual delas o seu código controla.

## Como funciona

**Cliente** é quem inicia a conversa; **servidor** é quem fica escutando um endereço e uma porta. Os papéis valem por conversa, não por máquina: o seu serviço de pedidos é servidor para o app e cliente do banco. Entre os dois existe um **caminho** de saltos, e a mensagem só avança quando cada equipamento decide quem é o próximo.

A latência de um trecho tem quatro componentes:

| Componente | O que é | Ordem de grandeza |
|---|---|---|
| Propagação | Tempo do sinal viajar pelo meio | ~5 µs por km na fibra (cerca de 200.000 km/s) |
| Transmissão | Tempo de colocar os bits no enlace | tamanho ÷ banda: 1500 B em 100 Mbit/s = 120 µs |
| Fila | Espera num roteador ocupado | de 0 a centenas de ms sob congestionamento |
| Processamento | Decisão de cada equipamento e da aplicação | µs em roteador; ms a s no servidor |

Duas ideias separam amadores de profissionais:

1. **Latência não é banda.** Banda é quantos bits por segundo cabem no enlace; latência é quanto tempo um bit leva. Uma resposta de 2 KB num enlace de 1 Gbit/s não fica mais rápida com 10 Gbit/s, porque quase todo o tempo é propagação e espera.
2. **RTT** (*round-trip time*) é o tempo de ida e volta, e é a unidade que importa. Um protocolo que exige 3 viagens custa 3 RTT, e a luz não negocia: São Paulo a Virgínia (EUA) tem piso físico de uns 77 ms de RTT, e na prática passa de 110 ms.

Números para ter na cabeça: dentro da mesma zona de disponibilidade, 0,2 a 0,5 ms; entre zonas da mesma região, 1 a 2 ms; São Paulo a Virgínia, 110 a 130 ms; São Paulo à Europa, perto de 200 ms. A conta de uma requisição HTTPS em conexão nova, sem otimização, é:

```text
DNS           1 RTT até o resolver (ou cache)
TCP           1 RTT   (handshake SYN, SYN-ACK, ACK)
TLS 1.3       1 RTT   (TLS 1.2 gasta 2)
HTTP          1 RTT + tempo do servidor
```

Com 120 ms de RTT, são **480 ms** antes de qualquer byte útil, sem contar o servidor. As aulas seguintes mostram como TCP, TLS e pool de conexões atacam cada uma dessas linhas.

## Na prática

Medir é o primeiro passo. O `ping` mede o RTT puro (ICMP). O `curl` com `-w` separa as fases de uma requisição real:

```bash
curl -o /dev/null -s -w 'dns=%{time_namelookup}s tcp=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s\n' https://loja.com.br
```

Os campos são cumulativos: `tcp` já inclui o `dns`, `ttfb` (tempo até o primeiro byte) inclui tudo antes. A subtração entre dois campos consecutivos mostra o custo de cada fase. Em Java, o mesmo raciocínio com o cliente HTTP da biblioteca padrão:

```java
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class MedirLatencia {
    public static void main(String[] args) throws Exception {
        String host = "example.com";

        // Abrir um socket TCP custa ~1 RTT: é o handshake.
        long t0 = System.nanoTime();
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, 443), 3_000);
        }
        System.out.printf("connect TCP: %.1f ms%n", (System.nanoTime() - t0) / 1e6);

        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .build();
        HttpRequest req = HttpRequest.newBuilder(URI.create("https://" + host + "/"))
                .timeout(Duration.ofSeconds(5))
                .GET().build();

        // A primeira chamada paga TCP + TLS; a segunda reaproveita a conexão.
        for (int i = 1; i <= 3; i++) {
            long t = System.nanoTime();
            HttpResponse<Void> r = client.send(req, HttpResponse.BodyHandlers.discarding());
            System.out.printf("requisição %d: %d em %.1f ms%n", i, r.statusCode(), (System.nanoTime() - t) / 1e6);
        }
    }
}
```

Na saída, a primeira requisição costuma ser uma ou duas vezes o RTT mais lenta que as seguintes. Essa diferença é o custo de conexão que um pool de conexões elimina.

## Armadilhas comuns

- **Otimizar o servidor quando o gargalo é a distância.** Se `time_connect` já é 100 ms, nenhum código dentro do servidor vai ganhar essa fatia. Meça as fases primeiro.
- **Medir só na própria máquina.** `localhost` tem RTT de microssegundos e esconde todos os problemas desta aula. Teste de uma rede e de uma região parecidas com a do usuário.
- **Confundir banda com latência.** "Comprei um link maior" não reduz o RTT. Para páginas com muitas requisições pequenas, a latência domina.
- **Presumir que o caminho de volta é o da ida.** Roteadores decidem por pacote e por direção; rotas assimétricas são normais e confundem `traceroute`.
- **Chamadas síncronas em cadeia.** Cinco serviços chamados em série, cada um a 2 ms, já são 10 ms de rede, e a cauda de latência (p99) cresce mais rápido que a média.
- **Timeout sem critério.** Um cliente sem `connectTimeout` fica pendurado quando o caminho quebra. Sempre defina timeout de conexão e de leitura.

## Checklist de domínio

- [ ] Você explica a diferença entre cliente, servidor e conexão, e por que o papel vale por conversa
- [ ] Você separa latência em propagação, transmissão, fila e processamento
- [ ] Você sabe a diferença entre latência e banda, e quando cada uma limita
- [ ] Você calcula o custo de DNS, TCP, TLS e HTTP em RTTs para uma conexão nova
- [ ] Você mede fases com `curl -w` e identifica onde está a maior fatia

## Para ir além

- [RFC 1122: Requirements for Internet Hosts, Communication Layers](https://www.rfc-editor.org/rfc/rfc1122)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
- [Java: pacote java.net.http (HttpClient)](https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/module-summary.html)
- [curl: opção --write-out](https://curl.se/docs/manpage.html#-w)
