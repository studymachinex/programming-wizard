> **Em uma frase:** cada camada de rede embrulha a mensagem em um cabeçalho próprio e só conversa com a camada igual do outro lado; o roteador desembrulha e refaz só os dois envelopes de baixo, e quem entende o encapsulamento sabe em que camada procurar cada defeito.

## O problema

"A API não responde." Pode ser o DNS que não resolve, a porta fechada no firewall, o certificado vencido, o pod que não passa na readiness ou um cabo solto no switch. Sem um modelo mental, o diagnóstico vira tentativa e erro, e quem chuta perde horas. O modelo em camadas é o mapa que diz **onde** olhar: endereço, porta, conexão ou aplicação.

Em entrevistas ele aparece o tempo todo, de forma disfarçada: "o que é um balanceador L7?", "o NAT mexe em que camada?", "por que o firewall não vê o conteúdo HTTPS?". Todas as respostas partem do encapsulamento.

## Como funciona

O **modelo OSI** tem 7 camadas e serve de vocabulário. O **modelo TCP/IP**, que a internet de fato implementa, tem 4:

| TCP/IP | OSI | Exemplos | Unidade de dados |
|---|---|---|---|
| Aplicação | 7, 6, 5 | HTTP, DNS, TLS, gRPC | mensagem |
| Transporte | 4 | TCP, UDP | segmento (TCP), datagrama (UDP) |
| Internet | 3 | IP, ICMP | pacote |
| Acesso à rede | 2, 1 | Ethernet, Wi-Fi | quadro (frame) |

Quando alguém fala em "L4", "L7" ou "L2", usa a numeração OSI: balanceador L4 olha IP e porta; L7 lê o HTTP; um switch é L2 e só conhece MAC.

**Encapsulamento** é o processo de descer pela pilha. A aplicação entrega uma mensagem ao TCP, que acrescenta o cabeçalho de transporte (portas, números de sequência: 20 bytes no mínimo). O IP acrescenta o cabeçalho de rede (endereços, TTL: 20 bytes no mínimo). A Ethernet acrescenta o de enlace (MAC de destino, MAC de origem, tipo: 14 bytes) e um **FCS** de 4 bytes no fim, que detecta corrupção. Na ida, o somatório do exemplo da cena é:

```text
HTTP   81 B   (GET /pedidos HTTP/1.1 + 3 cabeçalhos)
TCP    20 B   → segmento de 101 B
IP     20 B   → pacote de 121 B
ETH    14 B   → quadro de 135 B (+4 de FCS = 139 B no fio)
```

O que o **roteador** faz no caminho merece atenção: recebe o quadro, confere que o MAC de destino é dele, **descarta o cabeçalho Ethernet**, lê o IP, decrementa o TTL, escolhe o próximo salto e cria um Ethernet **novo**, com outros MACs. TCP e HTTP passam intactos (e a Ethernet só carrega um quadro por enlace). No destino, a pilha desembrulha na ordem inversa e entrega a mensagem ao processo que escuta a porta.

Dois campos "chave de decisão" saem desse desenho:

- **EtherType** (2 bytes na Ethernet): diz qual protocolo vem em seguida. `0x0800` é IPv4, `0x86DD` é IPv6, `0x0806` é ARP.
- **Protocolo** (1 byte no IP): diz o que vem depois do IP. `6` é TCP, `17` é UDP, `1` é ICMP.

Cada camada usa o campo da camada de baixo para saber como interpretar os bytes seguintes. É assim que um mesmo cabo carrega tráfego de todos os protocolos sem ambiguidade.

## Na prática

Para enxergar o encapsulamento, nada melhor que desembrulhar bytes à mão. O código abaixo recebe o início de um quadro (Ethernet, IPv4 e as portas do TCP) e imprime o que cada camada diz. É o mesmo trabalho que o Wireshark e o kernel fazem, sem os detalhes:

```java
import java.nio.ByteBuffer;
import java.util.HexFormat;

public class Quadro {
    static String mac(ByteBuffer b) {
        byte[] m = new byte[6];
        b.get(m);
        return HexFormat.ofDelimiter(":").formatHex(m);
    }

    static String ip(ByteBuffer b) {
        return (b.get() & 0xff) + "." + (b.get() & 0xff) + "." + (b.get() & 0xff) + "." + (b.get() & 0xff);
    }

    static void desembrulhar(byte[] bytes) {
        ByteBuffer b = ByteBuffer.wrap(bytes); // big-endian por padrão: é a ordem de rede

        // Camada 2: Ethernet, 14 bytes
        String destino = mac(b);
        String origem = mac(b);
        int tipo = b.getShort() & 0xffff;
        System.out.printf("Ethernet  %s -> %s  tipo=0x%04x%n", origem, destino, tipo);
        if (tipo != 0x0800) return; // não é IPv4

        // Camada 3: IPv4, 20 bytes sem opções
        int inicioIp = b.position();
        int ihl = (b.get() & 0x0f) * 4;   // IHL conta palavras de 4 bytes
        b.get();                          // DSCP/ECN
        int total = b.getShort() & 0xffff;
        b.getInt();                       // identificação, flags, offset
        int ttl = b.get() & 0xff;
        int protocolo = b.get() & 0xff;
        b.getShort();                     // checksum
        String src = ip(b);
        String dst = ip(b);
        System.out.printf("IPv4      %s -> %s  ttl=%d protocolo=%d total=%d%n", src, dst, ttl, protocolo, total);
        b.position(inicioIp + ihl);       // pula opções, se houver
        if (protocolo != 6) return;       // 6 = TCP

        // Camada 4: TCP
        System.out.printf("TCP       porta %d -> %d%n", b.getShort() & 0xffff, b.getShort() & 0xffff);
    }

    public static void main(String[] args) {
        String hex = "a491b15c2e07" + "3c22fb8a510e" + "0800"
                + "45000079" + "1c464000" + "4006" + "0000" + "c0a80017" + "cb00710a"
                + "ce4e0050";
        desembrulhar(HexFormat.of().parseHex(hex));
    }
}
```

A saída:

```text
Ethernet  3c:22:fb:8a:51:0e -> a4:91:b1:5c:2e:07  tipo=0x0800
IPv4      192.168.0.23 -> 203.0.113.10  ttl=64 protocolo=6 total=121
TCP       porta 52814 -> 80
```

Repare no `ByteBuffer` em big-endian: a **ordem de rede** põe o byte mais significativo primeiro, ao contrário de x86. Esquecer isso é o erro clássico ao escrever parsers binários, e por isso o `& 0xffff` converte o `short` com sinal do Java no valor sem sinal de 16 bits. Para ver quadros reais, `tcpdump -i eth0 -e -n port 80` mostra os MACs e os endereços IP lado a lado (aula 28).

## Armadilhas comuns

- **Tratar o OSI como arquitetura real.** Sessão e apresentação não são camadas separadas na internet. TLS, por exemplo, mora entre a aplicação e o TCP, e as classificações variam por livro.
- **Achar que o MAC viaja de ponta a ponta.** Ele só vale dentro do enlace e muda a cada roteador. Quem permanece é o IP (salvo NAT).
- **Dizer "o firewall vê o HTTP" em tráfego HTTPS.** Um firewall L3/L4 vê IP e porta. O conteúdo está cifrado pelo TLS, e só um proxy L7 que termina TLS o enxerga.
- **Misturar a unidade de cada camada.** "Pacote" é IP, "segmento" é TCP, "quadro" é Ethernet. Em entrevista isso mostra rigor.
- **Esquecer o custo dos cabeçalhos.** Uma mensagem de 1 byte num pacote TCP/IP/Ethernet ocupa 55 bytes (+4 de FCS) no fio. Mensagens minúsculas e frequentes têm eficiência péssima.
- **Ler campos multibyte na ordem da CPU.** Use `ByteBuffer` com `ByteOrder.BIG_ENDIAN` (o padrão) e máscaras para valores sem sinal.

## Checklist de domínio

- [ ] Você desenha as 4 camadas do TCP/IP e mapeia cada uma ao OSI
- [ ] Você lista o que cada cabeçalho acrescenta (portas, IPs, MACs) e quantos bytes tem
- [ ] Você explica o que um roteador desembrulha e o que ele reescreve em cada salto
- [ ] Você usa EtherType e protocolo IP para dizer como uma pilha sabe interpretar o que vem em seguida
- [ ] Você traduz "balanceador L4", "L7" e "switch L2" em termos do encapsulamento

## Para ir além

- [RFC 1122: Requirements for Internet Hosts, Communication Layers](https://www.rfc-editor.org/rfc/rfc1122)
- [RFC 791: Internet Protocol](https://www.rfc-editor.org/rfc/rfc791)
- [RFC 9293: Transmission Control Protocol (TCP)](https://www.rfc-editor.org/rfc/rfc9293)
- [IANA: números de protocolo IP](https://www.iana.org/assignments/protocol-numbers/protocol-numbers.xhtml)
