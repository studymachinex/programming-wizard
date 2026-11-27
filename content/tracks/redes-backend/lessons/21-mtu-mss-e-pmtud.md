> **Em uma frase:** o MTU é o maior pacote IP que um enlace aceita (1500 bytes na Ethernet), o MSS é o maior bloco de dados TCP que cabe nele (1460, ou 1448 com timestamps), e o Path MTU Discovery descobre o menor MTU do caminho com a ajuda de mensagens ICMP; se um firewall bloqueia esse ICMP, a conexão abre, as requisições pequenas funcionam e as respostas grandes travam.

## O problema

Uma equipe coloca o serviço atrás de uma VPN entre o escritório e a nuvem. O login funciona, as listagens pequenas respondem, mas toda exportação de relatório **trava no meio e dá timeout**. O `ping` está perfeito, o `curl` para a página inicial responde, e o `telnet` na porta conecta. Nenhum log da aplicação mostra erro: a resposta grande simplesmente nunca chega.

O sintoma é o clássico de um **PMTUD black hole**: tudo o que cabe num pacote pequeno funciona (o handshake, o `GET`, respostas curtas), e tudo o que enche pacotes de 1500 bytes some. Entender por que exige três números: MTU, MSS e o tamanho do caminho.

## Como funciona

### MTU e MSS

O **MTU** (*maximum transmission unit*) é o maior payload que um enlace carrega num quadro. Na Ethernet é **1500 bytes**, e esse valor inclui o cabeçalho IP: o cabeçalho Ethernet (14 bytes) e o FCS (4 bytes) ficam de fora da conta. O **MSS** (*maximum segment size*) é o maior bloco de **dados** que o TCP coloca num segmento. Para IPv4 sem opções:

```text
MSS = MTU - cabeçalho IP (20) - cabeçalho TCP (20) = 1500 - 40 = 1460
```

Cada ponta anuncia o seu MSS na opção do **SYN** (aula 11). Com a opção *timestamps* ligada, que é o padrão no Linux, cada segmento carrega 12 bytes de opções a mais e sobram **1448 bytes** de dados, o valor que você vê em `ss -ti` (`mss:1448`). No IPv6, o cabeçalho tem 40 bytes e o MSS cai 20 bytes.

### Quando o caminho é menor que 1500

O MTU que importa é o **menor MTU de todos os enlaces do caminho**, o *path MTU*. Túneis e encapsulamentos comem espaço: uma VPN ou um túnel acrescenta o próprio cabeçalho, então o enlace efetivo fica abaixo de 1500. PPPoE (banda larga) tem MTU 1492 por causa dos 8 bytes do cabeçalho. Redes de nuvem, overlays de contêineres e VPNs costumam ter valores como 1400 ou próximos, que variam por tecnologia e configuração, e por isso **você mede, não assume**.

### Fragmentar ou avisar?

Um roteador que recebe um pacote maior que o MTU do próximo enlace tem duas saídas. Se o bit **DF** (*don't fragment*) está desligado, ele **fragmenta** o pacote (aula 4). Se o DF está ligado, ele **descarta** o pacote e devolve ao remetente um **ICMP tipo 3, código 4** (*fragmentation needed and DF set*), que informa o MTU do próximo salto. O TCP moderno envia tudo com DF ligado, porque fragmentos são frágeis: perder um deles perde o pacote inteiro. O remetente lê o ICMP, reduz o tamanho dos segmentos e reenvia. É o **Path MTU Discovery** (RFC 1191).

### O buraco negro

O mecanismo depende de o ICMP voltar. Muitos firewalls bloqueiam ICMP por reflexo, e então o roteador descarta o pacote grande, o aviso se perde e o remetente continua mandando segmentos de 1500 bytes, que continuam sumindo, até o timeout. O handshake passou porque o SYN é minúsculo; uma requisição curta passou pelo mesmo motivo. Só os segmentos cheios caem.

No **IPv6**, roteadores nunca fragmentam: o remetente é quem precisa ajustar, e a mensagem equivalente é o **ICMPv6 Packet Too Big** (tipo 2). Bloquear ICMPv6 quebra o IPv6 de forma ainda mais direta. O mínimo garantido do IPv6 é 1280 bytes.

## Na prática

Para medir o MTU do caminho no Linux, mande um `ping` com DF ligado e vá reduzindo o tamanho. O payload do `ping` soma 8 bytes de ICMP e 20 de IP:

```bash
ping -M do -s 1472 203.0.113.10     # 1472 + 28 = 1500: cabe?
ping -M do -s 1372 203.0.113.10     # 1372 + 28 = 1400
tracepath 203.0.113.10              # mostra o pmtu em cada salto
ss -ti dst 203.0.113.10             # mss e pmtu da conexão real
```

Se o primeiro responde `Frag needed and DF set (mtu = 1400)` ou fica mudo enquanto o segundo passa, o caminho tem MTU 1400. No Java, você enxerga o MTU de cada interface da máquina:

```java
import java.net.NetworkInterface;
import java.util.Collections;

public class MtuMss {
    public static void main(String[] args) throws Exception {
        for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!ni.isUp() || ni.isLoopback()) continue;
            int mtu = ni.getMTU();
            if (mtu < 1280) continue;
            int mss = mtu - 20 - 20;      // IPv4 (20 B) + TCP (20 B)
            System.out.printf("%-12s MTU %d -> MSS %d (com timestamps: %d de dados)%n",
                    ni.getName(), mtu, mss, mss - 12);
        }
    }
}
```

Numa interface Ethernet típica, o programa imprime `MTU 1500 -> MSS 1460 (com timestamps: 1448 de dados)`. Isso mostra só o MTU **local**; o do caminho continua desconhecido até você testá-lo.

As curas, da mais correta para a mais prática:

1. **Deixar o ICMP passar.** Permita ICMP tipo 3 código 4 (e ICMPv6 tipo 2) nos firewalls. É a solução de raiz.
2. **MSS clamping** no roteador ou gateway do túnel: reescreve o MSS dos SYNs que passam, para que as pontas nunca montem segmentos grandes demais. Com `iptables`:

```bash
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
         -j TCPMSS --clamp-mss-to-pmtu
```

3. **PLPMTUD** (RFC 4821): o TCP sonda o caminho com segmentos maiores e reduz o tamanho ao perceber perdas, sem depender do ICMP. No Linux, ligue com `net.ipv4.tcp_mtu_probing=1` (ou `2`, sempre ligado).
4. **Baixar o MTU da interface** do túnel (`ip link set dev tun0 mtu 1400`).

## Armadilhas comuns

- **Bloquear todo ICMP "por segurança".** Ping você pode restringir; os tipos que fazem o PMTUD funcionar, não.
- **Concluir que "o ping funciona, então a rede está boa".** O ping padrão tem 84 bytes, longe de 1500.
- **Esquecer o overhead de túneis e overlays.** VPN, VXLAN, GRE e IPsec reduzem o MTU efetivo.
- **Confundir MTU com MSS.** O MTU inclui os cabeçalhos IP e TCP; o MSS é só o dado.
- **Habilitar jumbo frames (9000) de forma parcial.** Tudo no caminho precisa aceitar o mesmo valor.
- **Tratar a falha como "lentidão de rede".** Ela é determinística: acima de certo tamanho, nunca passa.

## Checklist de domínio

- [ ] Você calcula o MSS a partir do MTU e explica o 1448 com timestamps
- [ ] Você descreve o PMTUD: DF ligado, ICMP tipo 3 código 4 e o reenvio menor
- [ ] Você reconhece um black hole: conecta, requisição pequena passa, resposta grande trava
- [ ] Você mede o path MTU com `ping -M do -s` e `tracepath`
- [ ] Você conhece as curas: liberar o ICMP, MSS clamping, PLPMTUD e MTU da interface
- [ ] Você sabe que o IPv6 não fragmenta no caminho e depende do ICMPv6 Packet Too Big

## Para ir além

- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191)
- [RFC 8201: Path MTU Discovery for IP version 6](https://www.rfc-editor.org/rfc/rfc8201)
- [RFC 4821: Packetization Layer Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc4821)
- [Manual do tcp(7): tcp_mtu_probing](https://man7.org/linux/man-pages/man7/tcp.7.html)
