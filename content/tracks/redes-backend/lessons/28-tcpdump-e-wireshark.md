> **Em uma frase:** o `tcpdump` captura os pacotes que passam por uma interface e o Wireshark os decodifica numa interface gráfica; ler uma captura (flags, números de sequência e tempos) responde com evidência a perguntas que logs e métricas só adivinham, como onde o tempo foi gasto, quem fechou a conexão e se o pacote chegou.

## O problema

O serviço de pedidos responde em 200 ms para alguns clientes e demora 3 s para outros. O time de aplicação garante que o código leva 20 ms; o time de rede garante que a rede está saudável; o balanceador mostra latências altas, e ninguém concorda sobre **onde** o tempo vai. Os logs de cada lado só registram o que cada lado viu, e a pergunta decisiva é o que **aconteceu no fio**: o SYN chegou? Houve retransmissão? Quem mandou o RST?

A captura de pacotes é a única fonte que não depende da opinião de ninguém. Ela mostra o que saiu e o que chegou, com o horário de cada pacote.

## Como funciona

### Capturando com tcpdump

O `tcpdump` lê pacotes de uma interface (ele usa a biblioteca `libpcap`) e exige privilégio de root. Os parâmetros do dia a dia:

```bash
sudo tcpdump -i eth0 -nn 'tcp port 8080'           # na tela, sem resolver nomes nem portas
sudo tcpdump -i any -nn host 203.0.113.10          # todas as interfaces, só esse host
sudo tcpdump -i eth0 -nn -c 20 'tcp port 443'      # para depois de 20 pacotes
sudo tcpdump -i eth0 -nn -w captura.pcap 'port 8080'   # grava para abrir no Wireshark
tcpdump -nn -r captura.pcap                        # lê o arquivo gravado
```

`-nn` evita consultas DNS (que poluem a captura e atrasam a saída) e mostra portas em número. O **filtro** no fim é uma expressão **BPF** (*Berkeley Packet Filter*), avaliada no kernel, o que mantém a captura leve: `host`, `net`, `port`, `tcp`, `udp`, `src`, `dst`, combinados com `and`, `or` e `not`. Exemplo: `'tcp port 8080 and host 198.51.100.7'`. Para pegar só o início e o fim de conexões: `'tcp[tcpflags] & (tcp-syn|tcp-fin|tcp-rst) != 0'`.

Capturar em produção tem custo: filtre o máximo possível, limite com `-c` ou `-G`, e grave em arquivo em vez de imprimir (`-w`). O `-s` controla quantos bytes de cada pacote guardar; os cabeçalhos bastam para a maioria dos diagnósticos.

### Lendo uma linha

Uma captura de um `GET` simples, em um cliente `198.51.100.7` falando com o servidor `203.0.113.10:8080` (horários do relógio do cliente):

```text
14:02:11.100001 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [S], seq 3104581200, win 64240, length 0
14:02:11.112310 IP 203.0.113.10.8080 > 198.51.100.7.51514: Flags [S.], seq 871250770, ack 3104581201, win 65160, length 0
14:02:11.112342 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [.], ack 1, win 502, length 0
14:02:11.112790 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [P.], seq 1:84, ack 1, win 502, length 83
14:02:11.143012 IP 203.0.113.10.8080 > 198.51.100.7.51514: Flags [P.], seq 1:532, ack 84, win 509, length 531
14:02:11.143040 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [.], ack 532, win 501, length 0
```

Cada linha traz: horário, `origem.porta > destino.porta`, as **flags** entre colchetes, `seq`, `ack`, a janela `win` e o `length` (bytes de dados):

| Flags | Significado |
|---|---|
| `[S]` | SYN: pedido de conexão |
| `[S.]` | SYN-ACK: o ponto marca o ACK ligado |
| `[.]` | só ACK |
| `[P.]` | PUSH + ACK: dados para a aplicação |
| `[F.]` | FIN + ACK: fechamento |
| `[R]`, `[R.]` | RST: conexão derrubada |

**Números de sequência relativos:** o `tcpdump` mostra os dois primeiros segmentos com o número real (`seq 3104581200`) e os demais **relativos** ao início da conexão (`seq 1:84`, `ack 1`). O `-S` mostra sempre o número absoluto. `seq 1:84` quer dizer "bytes de 1 a 83", em `length 83`, e o `ack 84` da resposta confirma que o servidor recebeu tudo.

### O que a captura responde

- **RTT:** do `[S]` ao `[S.]`: 12,309 ms (100001 → 112310 µs).
- **Tempo do servidor:** do pedido `[P.]` (112790) à resposta `[P.]` (143012) passam 30,222 ms; tirando um RTT, sobram cerca de **17,9 ms** de aplicação. Com isso se separa a rede da aplicação.
- **Quem fecha:** o lado que manda o primeiro `[F.]` fica em TIME_WAIT (aula 24).
- **Retransmissão:** o mesmo `seq` aparecendo de novo, tipicamente após 1 s, 3 s... para SYNs (aula 15).
- **Recusa:** um `[R.]` em resposta ao SYN significa porta fechada; **silêncio** significa que algo descartou (aula 27).

### Wireshark

O Wireshark abre o `.pcap` e decodifica cada camada. O que mais se usa: **Follow TCP Stream** (reconstrói a conversa), os **filtros de exibição** (`tcp.analysis.retransmission`, `tcp.flags.reset == 1`, `http.request`, `ip.addr == 203.0.113.10`) e o **Expert Info**, que lista retransmissões, janelas zeradas e ACKs duplicados. Os filtros de exibição **não são** os filtros BPF da captura: a sintaxe é diferente.

### E o TLS?

Em HTTPS, a captura mostra só **metadados**: os endereços, os tempos, os tamanhos, e, no `ClientHello`, o nome do servidor (SNI, aula 19). O conteúdo está cifrado. Para decifrar na sua máquina, o navegador e muitas bibliotecas gravam os segredos da sessão num arquivo se a variável `SSLKEYLOGFILE` estiver definida, e o Wireshark os usa para mostrar o conteúdo. Isso é uma técnica de depuração local, e nunca para tráfego de terceiros.

## Na prática

O programa abaixo, completo, lê linhas no formato do `tcpdump` e calcula o RTT e o tempo do servidor, exatamente como se fez acima:

```java
import java.time.Duration;
import java.time.LocalTime;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class LeCaptura {
    static final String CAPTURA = """
        14:02:11.100001 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [S], seq 3104581200, win 64240, length 0
        14:02:11.112310 IP 203.0.113.10.8080 > 198.51.100.7.51514: Flags [S.], seq 871250770, ack 3104581201, win 65160, length 0
        14:02:11.112342 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [.], ack 1, win 502, length 0
        14:02:11.112790 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [P.], seq 1:84, ack 1, win 502, length 83
        14:02:11.143012 IP 203.0.113.10.8080 > 198.51.100.7.51514: Flags [P.], seq 1:532, ack 84, win 509, length 531
        14:02:11.143040 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [.], ack 532, win 501, length 0
        """;

    record Linha(LocalTime t, String origem, String flags, int tamanho) {}

    static final Pattern P = Pattern.compile(
            "(\\d\\d:\\d\\d:\\d\\d\\.\\d+) IP (\\S+) > \\S+ Flags \\[([^\\]]+)\\].*length (\\d+)");

    static List<Linha> ler(String texto) {
        return texto.lines().map(P::matcher).filter(Matcher::find)
                .map(m -> new Linha(LocalTime.parse(m.group(1)), m.group(2), m.group(3), Integer.parseInt(m.group(4))))
                .toList();
    }

    static double ms(LocalTime a, LocalTime b) {
        return Duration.between(a, b).toNanos() / 1e6;
    }

    public static void main(String[] args) {
        List<Linha> ls = ler(CAPTURA);
        Linha syn = ls.get(0), synAck = ls.get(1);
        Linha pedido = ls.stream().filter(l -> l.flags().equals("P.") && l.origem().startsWith("198.")).findFirst().orElseThrow();
        Linha resposta = ls.stream().filter(l -> l.flags().equals("P.") && l.origem().startsWith("203.")).findFirst().orElseThrow();

        double rtt = ms(syn.t(), synAck.t());                      // SYN -> SYN-ACK = 1 RTT
        double entrePedidoEResposta = ms(pedido.t(), resposta.t());
        System.out.printf("RTT do handshake        : %.3f ms%n", rtt);
        System.out.printf("pedido -> resposta      : %.3f ms%n", entrePedidoEResposta);
        System.out.printf("tempo do servidor (app) : %.3f ms%n", entrePedidoEResposta - rtt);
        System.out.printf("bytes: pedido %d, resposta %d%n", pedido.tamanho(), resposta.tamanho());
    }
}
```

A saída é `RTT do handshake : 12,309 ms`, `pedido -> resposta : 30,222 ms`, `tempo do servidor (app) : 17,913 ms` e `bytes: pedido 83, resposta 531` (o separador decimal segue o idioma do seu sistema). A captura **no cliente** mede o que o cliente viu; a mesma captura feita no servidor mostraria o tempo de aplicação sem a ida e a volta, e comparar as duas é uma técnica poderosa.

Um fluxo de trabalho que funciona: reproduzir o problema, capturar **dos dois lados** com o mesmo filtro, gravar em `.pcap`, abrir no Wireshark, seguir o stream do cliente problemático e procurar, em ordem, o handshake, o primeiro dado, a primeira retransmissão e o fechamento.

## Armadilhas comuns

- **Capturar sem `-nn`.** As resoluções de DNS atrasam a saída e adicionam pacotes à captura.
- **Filtro de captura largo demais em produção.** O volume derruba a capacidade da máquina; filtre por host e porta e limite o tamanho.
- **Confundir sintaxes de filtro.** `port 443` é BPF (`tcpdump`); `tcp.port == 443` é filtro de exibição (Wireshark).
- **Esquecer onde a captura foi feita.** Os tempos são do relógio e do ponto de captura; um RTT medido no cliente inclui a rede inteira.
- **Interpretar offloads como erros.** Com TSO e GRO ativos, a captura local pode mostrar segmentos maiores que o MTU, que não existem no fio.
- **Guardar capturas com dados sensíveis.** Um `.pcap` de tráfego sem TLS contém senhas e dados pessoais; trate-o como segredo.
- **Procurar o conteúdo de HTTPS.** Só os metadados são visíveis, a menos que a chave da sessão seja exportada com `SSLKEYLOGFILE`.

## Checklist de domínio

- [ ] Você captura com `tcpdump -i <iface> -nn '<filtro BPF>'` e grava um arquivo com `-w`
- [ ] Você lê as flags `[S]`, `[S.]`, `[.]`, `[P.]`, `[F.]` e `[R]` e entende `seq 1:84` e `ack`
- [ ] Você diferencia números relativos de absolutos (`-S`)
- [ ] Você calcula o RTT e o tempo do servidor a partir dos horários de uma captura
- [ ] Você usa o Follow TCP Stream e os filtros de exibição do Wireshark
- [ ] Você sabe o que se vê (e o que não se vê) numa captura de TLS e para que serve o `SSLKEYLOGFILE`

## Para ir além

- [Manual do tcpdump](https://www.tcpdump.org/manpages/tcpdump.1.html)
- [Manual do pcap-filter: sintaxe BPF](https://www.tcpdump.org/manpages/pcap-filter.7.html)
- [Wireshark User's Guide](https://www.wireshark.org/docs/wsug_html_chunked/)
- [Wireshark: decifrar TLS com o log de segredos](https://wiki.wireshark.org/TLS)
