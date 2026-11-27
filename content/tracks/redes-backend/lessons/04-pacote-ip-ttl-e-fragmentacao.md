> **Em uma frase:** o cabeçalho IPv4 tem 20 bytes e só o que um roteador precisa para decidir (endereços, TTL, protocolo, fragmentação); o TTL protege a rede de laços, e o tamanho do pacote contra o MTU do caminho decide se ele passa, é fragmentado ou é descartado com um aviso ICMP.

## O problema

Um serviço chama uma API parceira e tudo funciona, até que um payload JSON passa de certo tamanho: aí a conexão **trava**, sem erro, sem timeout curto, e só chamadas grandes falham. Os logs da aplicação não mostram nada. A causa é o tamanho do pacote: ele não cabe em um enlace no meio do caminho, o roteador devolve um ICMP pedindo para diminuir, e um firewall no caminho bloqueia esse ICMP. Quem não conhece o cabeçalho IP não chega a essa hipótese.

O mesmo cabeçalho também explica o `traceroute`, as mensagens `Time to live exceeded` e por que a camada de transporte divide mensagens em pedaços menores do que o enlace aceita.

## Como funciona

Um pacote **IPv4** é um cabeçalho seguido de dados. O cabeçalho tem entre **20 e 60 bytes**: 20 fixos mais até 40 de opções, raras hoje. Os campos principais:

| Campo | Bits | Para quê |
|---|---|---|
| Versão | 4 | Sempre 4 em IPv4 |
| IHL | 4 | Tamanho do cabeçalho em palavras de 4 bytes (5 = 20 B) |
| DSCP / ECN | 8 | Prioridade (QoS) e sinal de congestionamento |
| Tamanho total | 16 | Cabeçalho + dados; máximo 65.535 bytes |
| Identificação | 16 | Agrupa os fragmentos de um mesmo pacote |
| Flags | 3 | **DF** (não fragmentar) e **MF** (há mais fragmentos) |
| Offset do fragmento | 13 | Posição dos dados, em blocos de 8 bytes |
| **TTL** | 8 | Contador de saltos |
| Protocolo | 8 | 1 ICMP, 6 TCP, 17 UDP |
| Checksum | 16 | Só do cabeçalho |
| Origem e destino | 32 + 32 | Endereços |

**TTL (time to live)** nasceu como tempo, mas virou contador de saltos. A origem o inicia (64 no Linux e no macOS, 128 no Windows, 255 em vários roteadores). Cada roteador que encaminha subtrai 1 e **recalcula o checksum**, porque o cabeçalho mudou. Ao chegar a 0, o pacote é descartado e o roteador devolve **ICMP Time Exceeded** (tipo 11, código 0). Sem TTL, um laço de roteamento manteria pacotes circulando para sempre.

**MTU** é o maior pacote IP que um enlace aceita: 1500 bytes na Ethernet. Quando o pacote é maior, há dois caminhos:

- **DF = 0:** o roteador **fragmenta**. Um pacote de 4000 bytes (20 de cabeçalho + 3980 de dados) vira três: 1500 (1480 de dados), 1500 (1480) e 1040 (1020). O offset conta em blocos de 8 bytes (0, 185, 370), por isso cada fragmento, exceto o último, carrega um múltiplo de 8 bytes de dados. O último tem MF = 0. Todos levam a mesma Identificação, e **só o destino remonta**.
- **DF = 1:** o roteador descarta e envia **ICMP tipo 3, código 4** ("fragmentation needed and DF set"), com o MTU do enlace. A origem reduz o tamanho e tenta de novo. É o **Path MTU Discovery** (RFC 1191), usado pelo TCP.

Fragmentar é caro: se um fragmento se perde, o destino espera (30 s no Linux) e descarta tudo; o remetente reenvia o pacote **inteiro**. Firewalls e NATs também tratam mal fragmentos. Por isso o TCP prefere calcular um MSS que caiba (aula 21).

O **IPv6** simplificou: cabeçalho fixo de 40 bytes, endereços de 128 bits, sem checksum, e o campo TTL virou *Hop Limit*. Roteadores **nunca** fragmentam; só a origem pode, e o MTU mínimo garantido é 1280.

## Na prática

Ler e validar um cabeçalho é um bom exercício. O programa abaixo calcula o checksum (soma de palavras de 16 bits em complemento de um, RFC 1071), mostra os campos e reproduz o que um roteador faz: baixar o TTL e recalcular.

```java
import java.nio.ByteBuffer;
import java.util.HexFormat;

public class CabecalhoIp {
    /** Soma de palavras de 16 bits em complemento de um. Com o checksum embutido, o resultado válido é 0. */
    static int checksum(byte[] cab, int tamanho) {
        long soma = 0;
        for (int i = 0; i < tamanho; i += 2) {
            soma += ((cab[i] & 0xff) << 8) | (cab[i + 1] & 0xff);
        }
        while ((soma >> 16) != 0) soma = (soma & 0xffff) + (soma >> 16); // dobra os vai-um
        return (int) (~soma & 0xffff);
    }

    static void imprimir(byte[] cab) {
        ByteBuffer b = ByteBuffer.wrap(cab);
        int versaoIhl = b.get() & 0xff;
        b.get(); // DSCP/ECN
        int total = b.getShort() & 0xffff;
        int id = b.getShort() & 0xffff;
        int flagsOffset = b.getShort() & 0xffff;
        int ttl = b.get() & 0xff;
        int proto = b.get() & 0xff;
        System.out.printf("versao=%d ihl=%d total=%d id=0x%04x DF=%b MF=%b offset=%d ttl=%d proto=%d%n",
                versaoIhl >> 4, (versaoIhl & 0xf) * 4, total, id,
                (flagsOffset & 0x4000) != 0, (flagsOffset & 0x2000) != 0, (flagsOffset & 0x1fff) * 8, ttl, proto);
        System.out.println("checksum confere: " + (checksum(cab, 20) == 0));
    }

    public static void main(String[] args) {
        // 198.51.100.7 -> 203.0.113.10, TCP, 121 bytes, DF, TTL 64
        byte[] cab = HexFormat.of().parseHex("450000791c464000" + "4006" + "0000" + "c6336407cb00710a");
        int ck = checksum(cab, 20);                // calcula com o campo zerado
        cab[10] = (byte) (ck >> 8);
        cab[11] = (byte) ck;
        imprimir(cab);

        cab[8]--;                                  // um roteador baixa o TTL...
        cab[10] = 0; cab[11] = 0;
        ck = checksum(cab, 20);                    // ...e recalcula o checksum
        cab[10] = (byte) (ck >> 8);
        cab[11] = (byte) ck;
        System.out.printf("após 1 salto: checksum 0x%04x%n", ck);
        imprimir(cab);
    }
}
```

A primeira execução calcula `0xb7f3`; depois do salto, com TTL 63, o checksum passa a `0xb8f3`. Repare que o offset impresso é multiplicado por 8: o campo guarda blocos, não bytes.

No terminal, `ping -M do -s 1472 -c 1 host` envia um pacote de exatamente 1500 bytes (1472 de dados + 8 de ICMP + 20 de IP) com DF ligado, o teste clássico para descobrir o MTU de um caminho. Se o caminho tiver um enlace menor, o retorno é `Frag needed and DF set (mtu = N)`. Reduza `-s` até passar.

## Armadilhas comuns

- **Bloquear todo o ICMP no firewall.** Sem o tipo 3 código 4, o PMTUD quebra e surgem "buracos negros": conexões pequenas funcionam e as grandes travam. Permita ao menos os tipos 3 e 11.
- **Confundir TTL do IP com TTL do DNS.** Têm o mesmo nome e significados sem relação: um é contador de saltos, o outro é validade de cache em segundos.
- **Achar que TTL baixo revela o sistema operacional com certeza.** 64, 128 e 255 são padrões comuns, mas qualquer um altera o valor.
- **Esquecer o custo do cabeçalho.** Um datagrama UDP de 1 byte ocupa 29 bytes (20 IP + 8 UDP + 1). Eficiência ruim em mensagens minúsculas.
- **Contar offset em bytes.** O campo é medido em blocos de 8 bytes; 185 significa 1480.
- **Depender de fragmentação.** Ela sobrecarrega o destino, atrapalha firewalls e amplifica perdas. O desenho correto mantém o pacote abaixo do MTU do caminho.

## Checklist de domínio

- [ ] Você nomeia os campos do cabeçalho IPv4 e diz o tamanho mínimo e máximo dele
- [ ] Você explica por que o TTL existe e o que o roteador faz quando ele chega a 0
- [ ] Você calcula os fragmentos de um pacote de 4000 bytes com MTU 1500, incluindo offset e MF
- [ ] Você explica DF, ICMP "fragmentation needed" e o Path MTU Discovery
- [ ] Você sabe quais mudanças o IPv6 trouxe (cabeçalho fixo, sem fragmentação em roteadores)

## Para ir além

- [RFC 791: Internet Protocol](https://www.rfc-editor.org/rfc/rfc791)
- [RFC 1071: Computing the Internet Checksum](https://www.rfc-editor.org/rfc/rfc1071)
- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191)
- [RFC 8200: Internet Protocol, Version 6 (IPv6) Specification](https://www.rfc-editor.org/rfc/rfc8200)
