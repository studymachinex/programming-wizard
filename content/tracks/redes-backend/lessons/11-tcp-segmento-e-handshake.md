> **Em uma frase:** o TCP abre uma conexão com três segmentos (SYN, SYN-ACK, ACK) para combinar onde cada fluxo de bytes começa e quais opções valem; isso custa 1 RTT antes do primeiro byte útil, e um SYN perdido pode deixar um `connect()` esperando mais de dois minutos.

## O problema

Um health check do serviço de pedidos chama a API de estoque com `new Socket(host, 8080)`. Numa tarde, o host de estoque cai sem derrubar a rede: ele simplesmente não responde. O health check, e as threads que o executam, ficam pendurados por mais de **dois minutos**, até que a pilha TCP desista sozinha. Em poucos minutos o pool de threads do health check está esgotado e o orquestrador mata o pod saudável.

Para entender a causa e a correção (um timeout de conexão explícito) é preciso saber o que acontece entre o `connect()` e o primeiro byte: o handshake de três vias, o que ele negocia e como o kernel se comporta quando a resposta não vem.

## Como funciona

Um **segmento TCP** é um cabeçalho de 20 a 60 bytes seguido de dados. Os campos que importam para o handshake:

| Campo | Tamanho | Para quê |
|---|---|---|
| Porta de origem e de destino | 16 + 16 bits | Identificam a conexão junto com os IPs |
| Número de sequência (`seq`) | 32 bits | Posição, no fluxo de bytes, do primeiro byte deste segmento |
| Número de confirmação (`ack`) | 32 bits | O **próximo byte que quem envia espera receber** |
| Data offset | 4 bits | Tamanho do cabeçalho em palavras de 4 bytes (5 a 15) |
| Flags | 9 bits | SYN, ACK, FIN, RST, PSH, URG e outras |
| Janela | 16 bits | Quanto o receptor aguenta receber (controle de fluxo) |
| Checksum | 16 bits | Cobre cabeçalho, dados e pseudo-cabeçalho de IP |

**`seq` e `ack` contam bytes, não segmentos.** Se um lado envia 83 bytes começando em `seq=S`, o par responde `ack=S+83`: "recebi tudo até aqui, quero o próximo".

### Os três segmentos

O cliente (`198.51.100.7:51514`) quer falar com o servidor (`203.0.113.10:8080`):

1. **SYN**, cliente → servidor: `seq=X`, onde X é o **ISN** (*initial sequence number*). O ISN é **aleatório** (nos exemplos, `3104581200`): impede que segmentos atrasados de uma conexão antiga sejam aceitos pela nova e dificulta ataques que adivinham números de sequência.
2. **SYN-ACK**, servidor → cliente: `seq=Y` (o ISN do servidor) e `ack=X+1`.
3. **ACK**, cliente → servidor: `seq=X+1` e `ack=Y+1`.

Repare no `+1`: o **SYN consome um número de sequência**, mesmo sem carregar dados, para poder ser confirmado individualmente. O FIN faz o mesmo. Depois do terceiro segmento, os dois lados estão em **ESTABLISHED** e o primeiro byte de dados sai com `seq=X+1`.

### Opções negociadas no SYN

- **MSS** (*maximum segment size*): maior bloco de dados por segmento; 1460 em Ethernet (1500 de MTU menos 20 de IP e 20 de TCP). Com timestamps ativos, o `ss -ti` mostra `mss:1448`, porque a opção consome 12 bytes.
- **SACK permitido** (RFC 2018): ACKs de blocos fora de ordem, para retransmitir só o que faltou.
- **Escala de janela** (RFC 7323): multiplica o campo de 16 bits por 2ⁿ. **Só pode ser combinada no SYN.** Firewalls que removem opções TCP quebram o desempenho sem derrubar a conexão.
- **Timestamps**: medem o RTT por segmento e protegem contra números de sequência reaproveitados.

### O custo e as falhas

O handshake custa **1 RTT** antes do primeiro byte: com 120 ms de RTT, são 120 ms só para abrir. O TLS soma mais (aula 18). É por isso que conexões são reaproveitadas.

Se o SYN se perde, o cliente espera o **RTO inicial de 1 s** (RFC 6298) e retransmite, dobrando: 1, 2, 4, 8, 16, 32 e 64 s. No Linux, `tcp_syn_retries=6` desiste depois de cerca de **127 s**. O **TCP Fast Open** (RFC 7413) permite dados já no SYN em reconexões, mas o suporte em middleboxes é irregular e quase ninguém o usa.

Por que três vias, e não duas? Porque um SYN **antigo e duplicado**, atrasado na rede, poderia fazer o servidor abrir uma conexão que o cliente já esqueceu. Com o terceiro segmento, o cliente vê um SYN-ACK com um `ack` que não corresponde a nenhum `seq` seu e responde **RST**, e a conexão fantasma é desfeita.

## Na prática

O programa abaixo monta o SYN da cena em bytes e o decodifica, como um `tcpdump` faria. Ele mostra a ordem de rede (*big-endian*), o `seq` de 32 bits sem sinal (em Java, `int` tem sinal: máscara `0xffffffffL`), o data offset e as opções:

```java
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

public class CabecalhoTcp {
    record Segmento(int origem, int destino, long seq, long ack, List<String> flags, int janela, int tamanhoCab, List<String> opcoes) {}

    static Segmento ler(byte[] bytes) {
        ByteBuffer b = ByteBuffer.wrap(bytes);                       // big-endian: ordem de rede
        int origem = b.getShort() & 0xffff;
        int destino = b.getShort() & 0xffff;
        long seq = b.getInt() & 0xffffffffL;                         // 32 bits sem sinal
        long ack = b.getInt() & 0xffffffffL;
        int offFlags = b.getShort() & 0xffff;
        int tamanhoCab = (offFlags >> 12) * 4;                       // data offset em palavras de 4 bytes
        int janela = b.getShort() & 0xffff;
        b.getShort();                                                // checksum (não verificado aqui)
        b.getShort();                                                // urgent pointer

        List<String> flags = new ArrayList<>();
        String[] nomes = {"FIN", "SYN", "RST", "PSH", "ACK", "URG"};
        for (int i = 0; i < nomes.length; i++) if ((offFlags & (1 << i)) != 0) flags.add(nomes[i]);

        List<String> opcoes = new ArrayList<>();
        while (b.position() < tamanhoCab) {
            int tipo = b.get() & 0xff;
            if (tipo == 0) break;                                    // fim da lista
            if (tipo == 1) { opcoes.add("NOP"); continue; }
            int tam = b.get() & 0xff;
            switch (tipo) {
                case 2 -> opcoes.add("MSS " + (b.getShort() & 0xffff));
                case 3 -> opcoes.add("escala " + b.get());
                case 4 -> opcoes.add("SACK permitido");
                case 8 -> opcoes.add("timestamps " + b.getInt() + "/" + b.getInt());
                default -> b.position(b.position() + tam - 2);
            }
        }
        return new Segmento(origem, destino, seq, ack, flags, janela, tamanhoCab, opcoes);
    }

    static byte[] syn(int origem, int destino, long isn) {
        ByteBuffer b = ByteBuffer.allocate(40);
        b.putShort((short) origem).putShort((short) destino).putInt((int) isn).putInt(0);
        b.putShort((short) ((10 << 12) | 0x002)).putShort((short) 64240).putShort((short) 0).putShort((short) 0);
        b.put(new byte[] {2, 4, 0x05, (byte) 0xb4});                 // MSS 1460
        b.put(new byte[] {4, 2});                                    // SACK permitido
        b.put(new byte[] {8, 10}).putInt(1923001).putInt(0);         // timestamps
        b.put((byte) 1);                                             // NOP
        b.put(new byte[] {3, 3, 7});                                 // escala 7
        return b.array();
    }

    public static void main(String[] args) {
        Segmento s = ler(syn(51514, 8080, 3_104_581_200L));
        System.out.println(s);
        System.out.println("o SYN-ACK deve trazer ack=" + (s.seq() + 1));   // o SYN consome 1 número de sequência
    }
}
```

A saída mostra `flags=[SYN]`, `tamanhoCab=40`, as opções `[MSS 1460, SACK permitido, timestamps 1923001/0, NOP, escala 7]` e `o SYN-ACK deve trazer ack=3104581201`.

No terminal, `sudo tcpdump -nS -c 3 -i eth0 'tcp port 8080'` captura os três segmentos (`-S` mostra os números absolutos; sem ele o tcpdump os exibe relativos ao ISN), e `ss -ltn` mostra quem escuta e `ss -tan` o estado de cada conexão.

O cuidado de código é sempre o **timeout de conexão**. Em Java, `new Socket(host, porta)` não tem timeout de conexão; use:

```java
Socket s = new Socket();
s.connect(new InetSocketAddress("203.0.113.10", 8080), 2_000);   // falha em 2 s com SocketTimeoutException
s.setSoTimeout(5_000);                                           // e um timeout também para cada read()
```

## Armadilhas comuns

- **`connect()` sem timeout.** Com `tcp_syn_retries=6`, um host mudo prende a thread por ~127 s. Sempre passe um tempo.
- **Confundir `connect()` bem-sucedido com serviço funcionando.** Só prova que o kernel do servidor completou o handshake (aula 15): a aplicação pode nem estar aceitando.
- **Ler `seq` como `int` com sinal.** Números acima de 2³¹ viram negativos. Use `long` e a máscara `0xffffffffL`.
- **Achar que o ISN é zero ou sequencial.** É aleatório; um ISN previsível é vulnerabilidade.
- **Esquecer que o SYN e o FIN ocupam um número de sequência.** É a fonte do `+1` e de erros de off-by-one ao conferir capturas.
- **Culpar a rede por lentidão de abertura.** Antes de otimizar, meça `time_connect` no `curl -w`: ele é o RTT mais o tempo do kernel remoto.

## Checklist de domínio

- [ ] Você descreve os três segmentos do handshake com `seq` e `ack` corretos
- [ ] Você explica por que o ACK é ISN + 1 e por que o ISN é aleatório
- [ ] Você lista as opções do SYN (MSS, SACK, escala de janela, timestamps) e o efeito de cada uma
- [ ] Você calcula quanto tempo um SYN perdido leva para esgotar as tentativas (≈ 127 s) e configura o timeout de conexão
- [ ] Você explica por que o handshake tem três vias e o que o RST do cliente faz com um SYN antigo
- [ ] Você lê um SYN, um SYN-ACK e um ACK numa captura do `tcpdump`

## Para ir além

- [RFC 9293: Transmission Control Protocol (TCP)](https://www.rfc-editor.org/rfc/rfc9293)
- [RFC 6298: Computing TCP's Retransmission Timer](https://www.rfc-editor.org/rfc/rfc6298)
- [RFC 7323: TCP Extensions for High Performance (escala de janela e timestamps)](https://www.rfc-editor.org/rfc/rfc7323)
- [RFC 2018: TCP Selective Acknowledgment Options](https://www.rfc-editor.org/rfc/rfc2018)
- [RFC 7413: TCP Fast Open](https://www.rfc-editor.org/rfc/rfc7413)
