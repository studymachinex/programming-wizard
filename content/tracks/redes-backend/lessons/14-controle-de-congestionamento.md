> **Em uma frase:** o remetente TCP controla uma segunda janela, a cwnd, que ele mesmo calcula: dobra a cada RTT no slow start, cresce 1 MSS por RTT na prevenção de congestionamento, cai pela metade quando 3 ACKs duplicados denunciam uma perda (Reno) e volta a 1 MSS quando um timeout expira.

## O problema

Uma equipe migra um serviço de relatórios para outra região da nuvem. O enlace é de 1 Gbit/s, mas o download de um arquivo de 50 MB leva segundos a mais do que o previsto, e um teste de `iperf` curto mostra uma vazão de poucos Mbit/s que só sobe depois de um tempo. Em outro serviço, um pico de tráfego faz a vazão **oscilar em dente de serra** e, de repente, despencar.

Nada está quebrado: é o **controle de congestionamento** do TCP. Ele descobre a banda disponível por tentativa e erro, a cada conexão, e reage a perdas encolhendo a janela. Entender o desenho explica por que conexões novas são lentas, por que perdas custam tanto e por que reaproveitar conexões compensa.

## Como funciona

A rede é compartilhada, e o remetente não sabe quanta banda existe. Se enviar demais, as filas dos roteadores enchem e os pacotes se perdem (em 1986, esse excesso causou o **colapso de congestionamento** da internet da época; o controle atual vem do trabalho de Van Jacobson em 1988). O remetente mantém a **cwnd** (*congestion window*), medida aqui em **MSS** (segmentos cheios). O envio efetivo é **`min(rwnd, cwnd)`**.

### Slow start

A conexão começa com a **janela inicial**: 10 segmentos (**IW10**, RFC 6928, padrão no Linux). A cwnd cresce **1 MSS por ACK recebido**, o que dá o **dobro por RTT**: 10, 20, 40. O crescimento é exponencial: "lento" só em comparação com enviar tudo de uma vez. Dura até a primeira perda ou até alcançar o **ssthresh** (*slow start threshold*).

### Congestion avoidance

Ao alcançar o ssthresh, a cwnd passa a crescer **1 MSS por RTT** (1/cwnd por ACK): 40, 41, 42... É o *additive increase*: cautela de quem já está perto do limite.

### Perda detectada por 3 ACKs duplicados

Se um segmento se perde mas os seguintes chegam, o receptor repete o ACK do último byte contíguo a cada segmento fora de ordem. **Três ACKs duplicados** são um sinal forte de que só um segmento sumiu e a rede ainda funciona. O remetente faz o **fast retransmit** (reenvia o segmento sem esperar o timeout) e o **fast recovery**: no **Reno**, `ssthresh = cwnd/2` e `cwnd = ssthresh`. É o *multiplicative decrease*: de 44 a 22.

### Perda detectada por timeout

Se **nenhum** ACK volta, só o temporizador de retransmissão (RTO) avisa: mínimo de 200 ms no Linux, dobrando a cada tentativa. Sem informação nenhuma, o TCP assume o pior: `ssthresh = cwnd/2` e **`cwnd = 1 MSS`** (RFC 5681). Depois o slow start recomeça até o novo ssthresh. Um timeout é **muito mais caro** que a recuperação rápida.

### AIMD e justiça

A combinação, *additive increase, multiplicative decrease* (**AIMD**), desenha o dente de serra e faz conexões concorrentes **convergirem para uma divisão justa** do gargalo, sem coordenação: quem tem mais perde mais em termos absolutos.

A simulação da cena, por RTT, com ssthresh inicial de 40:

| RTT | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | ... | 11 | 12 | 13 | 14 | 15 | 16 | 17 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cwnd | 10 | 20 | 40 | 41 | 42 | 43 | 44 | 22 | 23 | ... | 26 | 1 | 2 | 4 | 8 | 13 | 14 |

No RTT 6 houve perda por 3 ACKs duplicados (cwnd e ssthresh vão a 22); no RTT 11, um timeout (ssthresh 13, cwnd 1).

### CUBIC e BBR

O que vimos é o **Reno**, a base didática. O Linux usa **CUBIC** por padrão (RFC 9438): depois de uma perda, a cwnd cresce segundo uma função cúbica do tempo desde a perda e o corte é de cerca de 30%, e não de 50%. O **BBR** é uma alternativa que não reage a perdas: estima a banda do gargalo e o RTT mínimo e regula o ritmo de envio por esse modelo, o que ajuda em caminhos longos com perda aleatória. No Linux, `sysctl net.ipv4.tcp_congestion_control` mostra o algoritmo e `net.ipv4.tcp_available_congestion_control` os disponíveis. Os conceitos (cwnd, ssthresh, ACKs como relógio) valem para todos.

## Na prática

O programa abaixo implementa o Reno por RTT, sem rede nenhuma: cada rodada recebe um evento (ACKs normais, 3 ACKs duplicados ou timeout) e atualiza `cwnd` e `ssthresh`. A cena e a tabela acima saíram dele.

```java
import java.util.ArrayList;
import java.util.List;

public class Reno {
    enum Evento { ACK_OK, TRES_ACKS_DUPLICADOS, TIMEOUT }

    static int cwnd = 10;          // em MSS (IW10)
    static int ssthresh = 40;

    /** Uma rodada (1 RTT). Devolve a cwnd usada nela e atualiza o estado para a próxima. */
    static int rodada(Evento e) {
        int usada = cwnd;
        switch (e) {
            case ACK_OK -> cwnd = cwnd < ssthresh ? Math.min(cwnd * 2, ssthresh) : cwnd + 1;   // slow start dobra; avoidance soma 1
            case TRES_ACKS_DUPLICADOS -> { ssthresh = Math.max(cwnd / 2, 2); cwnd = ssthresh; }  // Reno: metade
            case TIMEOUT -> { ssthresh = Math.max(cwnd / 2, 2); cwnd = 1; }                       // volta a 1 MSS
        }
        return usada;
    }

    public static void main(String[] args) {
        List<Evento> linha = new ArrayList<>();
        for (int i = 0; i < 6; i++) linha.add(Evento.ACK_OK);        // RTTs 0..5
        linha.add(Evento.TRES_ACKS_DUPLICADOS);                      // RTT 6: perda com cwnd 44
        for (int i = 0; i < 4; i++) linha.add(Evento.ACK_OK);        // RTTs 7..10
        linha.add(Evento.TIMEOUT);                                   // RTT 11: timeout com cwnd 26
        for (int i = 0; i < 6; i++) linha.add(Evento.ACK_OK);        // RTTs 12..17

        for (int rtt = 0; rtt < linha.size(); rtt++) {
            int usada = rodada(linha.get(rtt));
            System.out.printf("RTT %2d: cwnd=%2d  %-22s -> proxima=%2d ssthresh=%2d%n", rtt, usada, linha.get(rtt), cwnd, ssthresh);
        }
    }
}
```

A saída tem, por exemplo, `RTT  6: cwnd=44  TRES_ACKS_DUPLICADOS   -> proxima=22 ssthresh=22` e `RTT 11: cwnd=26  TIMEOUT                -> proxima= 1 ssthresh=13`. Repare em `Math.min(cwnd * 2, ssthresh)`: se dobrar passaria do ssthresh (como de 8 para 16 quando o ssthresh é 13), a cwnd para exatamente nele, e a rodada seguinte já é de congestion avoidance. O exercício deste módulo pede uma versão completa dessa máquina.

Para ver os valores reais de uma conexão: `ss -ti dst 203.0.113.10` mostra `cubic`, `cwnd:`, `ssthresh:` (só depois da primeira perda), `rtt:` e `mss:`. Para mudar o algoritmo de uma conexão em Java, não há API padrão; no Linux, `sysctl -w net.ipv4.tcp_congestion_control=bbr` muda o padrão do sistema (o módulo precisa estar carregado).

### Quanto custa uma conexão nova

Com cwnd = 10 e MSS 1448, o primeiro RTT envia 14,5 KB, o que dá 2,3 Mbit/s a 50 ms de RTT. Para encher 1 Gbit/s a 50 ms, o BDP é ~6,25 MB (4.316 segmentos), e o slow start precisa de cerca de **9 RTTs (450 ms)** só para chegar lá. Respostas de até ~14 KB cabem na janela inicial e terminam em 1 RTT; transferências médias passam a maior parte da vida no slow start. É por isso que o **keep-alive e o pool de conexões** importam: uma conexão aquecida já tem uma cwnd grande.

## Armadilhas comuns

- **Medir vazão com transferências curtas.** Um teste de 1 MB mede o slow start, não o enlace. Meça por tempo suficiente (ou com várias conexões) para sair da fase inicial.
- **Abrir uma conexão por requisição.** Cada uma paga handshake **e** recomeça a cwnd no IW10. Reaproveite.
- **Culpar o enlace quando há perdas aleatórias.** Em Wi-Fi ou satélite, perdas que não são congestionamento fazem o Reno e o CUBIC reduzirem a janela sem necessidade. BBR ou QUIC podem ajudar, mas meça.
- **Achar que um timeout é igual a uma perda rápida.** Perder o **último** segmento de uma rajada, sem outros atrás para gerar ACKs duplicados, só se resolve por timeout: queda a 1 MSS e 200 ms parado.
- **Confundir cwnd com rwnd.** A primeira protege a rede; a segunda, o receptor. A menor delas manda.
- **Ajustar `sysctl` de congestionamento sem medir.** Trocar para BBR pode piorar a justiça com outros fluxos; teste com tráfego real.

## Checklist de domínio

- [ ] Você descreve slow start, congestion avoidance, fast retransmit e fast recovery e quando cada fase começa e acaba
- [ ] Você calcula a cwnd e o ssthresh depois de uma perda por 3 ACKs duplicados (Reno) e depois de um timeout
- [ ] Você explica o AIMD e por que ele distribui a banda de forma justa
- [ ] Você sabe que o envio é min(rwnd, cwnd) e diferencia os dois limites
- [ ] Você cita CUBIC como padrão do Linux, BBR como alternativa e sabe a ideia de cada um
- [ ] Você explica por que conexões novas são lentas e como pools e keep-alive reduzem o problema

## Para ir além

- [RFC 5681: TCP Congestion Control](https://www.rfc-editor.org/rfc/rfc5681)
- [RFC 6928: Increasing TCP's Initial Window](https://www.rfc-editor.org/rfc/rfc6928)
- [RFC 9438: CUBIC for Fast and Long-Distance Networks](https://www.rfc-editor.org/rfc/rfc9438)
- [BBR Congestion Control (IETF draft)](https://datatracker.ietf.org/doc/draft-ietf-ccwg-bbr/)
- [Documentação do kernel: ip-sysctl (tcp_congestion_control, somaxconn e outros)](https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html)
