> **Em uma frase:** um bloco CIDR (`10.0.2.0/24`) é um endereço de rede mais o número de bits que o identificam; com a máscara, um AND bit a bit diz a que rede um IP pertence, e é isso que separa "falo direto com o vizinho" de "entrego ao gateway".

## O problema

Você cria a VPC de um produto com `10.0.0.0/16`, e meses depois o time precisa ligá-la por VPN à rede de um cliente, que também usa `10.0.0.0/16`. Os blocos se sobrepõem, o roteamento fica ambíguo e a opção é renumerar tudo em produção. Ou o oposto: a sub-rede de um cluster foi criada como `/28`, com 11 IPs úteis na AWS, e o autoscaler para de criar nós por falta de endereços.

Dimensionar blocos é uma decisão de arquitetura barata de acertar no início e muito cara de corrigir depois. Exige duas habilidades: ler a notação CIDR sem pensar e fazer a conta de máscara de cabeça.

## Como funciona

No começo, o IPv4 usava **classes** (A, B, C) com tamanhos fixos, e isso desperdiçava endereços. O **CIDR** (RFC 4632) permite qualquer tamanho de prefixo: `203.0.113.0/24` significa que os **24 primeiros bits** identificam a rede e os 8 últimos numeram os hosts. Quanto **maior** o prefixo, **menor** a rede.

A **máscara** é o mesmo prefixo escrito em 32 bits: `/24` = `11111111.11111111.11111111.00000000` = `255.255.255.0`. Para descobrir a rede de um host, faça **IP AND máscara**:

```text
IP       10.0.2.37   00001010.00000000.00000010.00100101
máscara  /24         11111111.11111111.11111111.00000000
rede     10.0.2.0    00001010.00000000.00000010.00000000
```

O **broadcast** é a rede com todos os bits de host em 1 (`10.0.2.255`). Os endereços entre os dois são os **hosts úteis**: `2^(32 − prefixo) − 2`. Quando o prefixo não cai na fronteira de um octeto, a conta é a mesma, só que o corte passa no meio de um número:

| Prefixo | Máscara | Endereços | Hosts úteis |
|---|---|---|---|
| /16 | 255.255.0.0 | 65.536 | 65.534 |
| /24 | 255.255.255.0 | 256 | 254 |
| /25 | 255.255.255.128 | 128 | 126 |
| /26 | 255.255.255.192 | 64 | 62 |
| /27 | 255.255.255.224 | 32 | 30 |
| /28 | 255.255.255.240 | 16 | 14 |
| /30 | 255.255.255.252 | 4 | 2 |
| /31 | 255.255.255.254 | 2 | 2 (RFC 3021, ponto a ponto) |
| /32 | 255.255.255.255 | 1 | 1 (um único host) |

Os dois casos finais fogem da regra do "menos 2": em `/31` não há rede nem broadcast (o RFC 3021 usa os dois endereços em enlaces entre roteadores), e `/32` identifica um único host, usado em rotas para uma máquina e em endereços de loopback.

**Falar direto ou via gateway** é uma decisão tomada com essa conta. O host aplica a máscara dele ao próprio IP e ao IP de destino. Se o resultado é igual, estão na mesma rede: vai por ARP e switch. Se é diferente, o quadro vai ao gateway padrão.

Os blocos **privados** (RFC 1918) nunca são roteados na internet: `10.0.0.0/8`, `172.16.0.0/12` (172.16 a 172.31) e `192.168.0.0/16`. Outros blocos especiais: `100.64.0.0/10` (CGNAT, RFC 6598), `169.254.0.0/16` (link-local, quando o DHCP falha), `127.0.0.0/8` (loopback) e os blocos de documentação `192.0.2.0/24`, `198.51.100.0/24` e `203.0.113.0/24` (RFC 5737), usados nos exemplos desta trilha.

Provedores de nuvem reservam endereços em cada sub-rede. Na AWS, são 5: os quatro primeiros (rede, roteador, DNS e reserva) e o último (broadcast). Por isso um `/28` rende 11 hosts e um `/24` rende 251.

## Na prática

A conta de rede, broadcast e pertencimento cabe em poucas linhas com inteiros de 32 bits. Em Java, o `int` tem sinal, mas só os 32 bits importam, e `>>>` faz o deslocamento sem estender o sinal:

```java
public class Cidr {
    record Bloco(int base, int prefixo) {
        static int paraInt(String ip) {
            int v = 0;
            for (String s : ip.split("[.]")) v = (v << 8) | Integer.parseInt(s);
            return v;
        }

        static String paraTexto(int v) {
            return ((v >>> 24) & 0xff) + "." + ((v >>> 16) & 0xff) + "." + ((v >>> 8) & 0xff) + "." + (v & 0xff);
        }

        static Bloco parse(String cidr) {
            String[] p = cidr.split("/");
            int prefixo = Integer.parseInt(p[1]);
            return new Bloco(paraInt(p[0]) & mascara(prefixo), prefixo);
        }

        /** /0 é especial: em Java, "-1 << 32" não zera, volta ao valor original. */
        static int mascara(int prefixo) {
            return prefixo == 0 ? 0 : -1 << (32 - prefixo);
        }

        int broadcast() { return base | ~mascara(prefixo); }

        boolean contem(String ip) { return (paraInt(ip) & mascara(prefixo)) == base; }

        long enderecos() { return 1L << (32 - prefixo); }
    }

    public static void main(String[] args) {
        Bloco b = Bloco.parse("10.0.2.37/24");
        System.out.println("rede      " + Bloco.paraTexto(b.base()));      // 10.0.2.0
        System.out.println("broadcast " + Bloco.paraTexto(b.broadcast())); // 10.0.2.255
        System.out.println(b.contem("10.0.2.200") + " " + b.contem("10.0.3.15")); // true false
    }
}
```

Dois detalhes valem a leitura. `parse` já aplica a máscara ao endereço recebido, então `10.0.2.37/24` vira o bloco de base `10.0.2.0`. E `mascara(0)` precisa de um caso à parte: em Java, o deslocamento de `int` usa só os 5 bits menos significativos do operando, então `-1 << 32` é `-1 << 0`, e não zero. O exercício deste módulo parte dessa estrutura e acrescenta a faixa de hosts, os casos `/31` e `/32` e uma tabela de rotas com *longest prefix match*.

No dia a dia, `ip -br -4 addr` mostra os IPs e prefixos de cada interface, e `ip route` mostra para onde vai cada rede. Para planejar, uma planilha com os blocos de todas as VPCs, regiões e filiais evita a sobreposição.

## Armadilhas comuns

- **Blocos sobrepostos entre VPCs ou filiais.** Impedem VPN e peering. Defina um plano de endereçamento da empresa antes de criar a primeira rede.
- **Sub-redes pequenas demais.** Clusters, funções e interfaces de rede consomem IPs em volume (cada pod pode ter um). Use `/24` ou maior para camadas que escalam.
- **Esquecer os endereços reservados.** Na nuvem, o útil é menor que `2^n − 2`; conte os 5 reservados da AWS.
- **Trocar `/24` por `255.255.255.0` de cabeça e errar nos prefixos intermediários.** Decore `/25` = `.128`, `/26` = `.192`, `/27` = `.224`, `/28` = `.240`.
- **Aplicar `<< 32` em Java.** Para o prefixo 0, o resultado é uma máscara cheia de 1 em vez de zero.
- **Usar `172.16.0.0/16` achando que é todo o 172.16/12.** Só o bloco `/12` completo (até `172.31.255.255`) é privado; `172.32.x.x` já é público.
- **Comparar IPs como texto.** `"10.0.2.9" > "10.0.2.10"` em ordem lexicográfica. Converta para inteiro antes de comparar.

## Checklist de domínio

- [ ] Você converte entre `/n` e máscara e calcula rede, broadcast e hosts úteis de qualquer prefixo
- [ ] Você decide, com AND bit a bit, se dois hosts estão na mesma sub-rede
- [ ] Você lista os blocos RFC 1918, CGNAT, link-local e de documentação
- [ ] Você conhece as exceções `/31` e `/32` e os endereços reservados na nuvem
- [ ] Você planeja blocos para evitar sobreposição e esgotamento

## Para ir além

- [RFC 4632: Classless Inter-domain Routing (CIDR)](https://www.rfc-editor.org/rfc/rfc4632)
- [RFC 1918: Address Allocation for Private Internets](https://www.rfc-editor.org/rfc/rfc1918)
- [RFC 3021: Using 31-Bit Prefixes on IPv4 Point-to-Point Links](https://www.rfc-editor.org/rfc/rfc3021)
- [RFC 5737: IPv4 Address Blocks Reserved for Documentation](https://www.rfc-editor.org/rfc/rfc5737)
- [AWS: CIDR blocks de sub-rede e IPs reservados](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html)
