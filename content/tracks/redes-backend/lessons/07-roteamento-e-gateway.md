> **Em uma frase:** cada roteador consulta uma tabela de rotas, separa as que casam com o destino e escolhe a de prefixo mais longo (a mais específica); quando nenhuma casa, usa a rota padrão, e quando nem ela existe, descarta o pacote e avisa a origem com ICMP.

## O problema

Uma filial nova foi ligada à matriz por VPN e ninguém consegue acessar o ERP de lá. O `ping` falha, o `traceroute` termina no segundo salto e o time culpa a VPN. A VPN estava correta. Duas rotas se sobrepunham (`10.0.0.0/16` pela matriz e `10.0.5.0/24` pela filial), e uma delas apontava para o lugar errado. Resolver o caso exige uma pergunta só: **qual rota o roteador escolheu para esse destino?**

Roteamento também é a base de tudo que vem depois: VPC, peering, Kubernetes, balanceadores com IP virtual. Entender como uma tabela decide é o que permite depurar essas camadas.

## Como funciona

Cada máquina que encaminha pacotes tem uma **tabela de rotas**. Cada linha diz: para este **prefixo**, mande ao **próximo salto** (*next hop*) por esta **interface**:

```text
$ ip route
default via 203.0.113.1 dev eth2
10.0.0.0/16 via 10.255.0.2 dev eth1
10.0.5.0/24 via 10.255.0.3 dev eth1
10.1.0.0/24 dev eth0 proto kernel scope link src 10.1.0.1
```

Linhas sem `via` são **redes diretamente conectadas**: o kernel as cria sozinho quando a interface recebe um endereço. As demais vêm de três fontes: **estáticas** (`ip route add 10.0.5.0/24 via 10.255.0.3`), **dinâmicas** (aprendidas por OSPF dentro de uma organização, BGP entre operadoras) ou de **DHCP**, que entrega o gateway ao host.

### O algoritmo de escolha

Para um pacote com destino `D`, o roteador:

1. Seleciona **todas** as rotas cujo prefixo contém `D` (`D AND máscara == rede`). A rota `0.0.0.0/0` contém qualquer endereço, então sempre casa.
2. Entre as que casam, escolhe a de **maior prefixo**: o **longest prefix match**. É a regra mais importante do roteamento IP (RFC 1812).
3. Se houver empate de prefixo, desempata a distância administrativa e a métrica; com empate total, o kernel pode dividir o tráfego (ECMP).
4. Decrementa o TTL, recalcula o checksum e encaminha ao próximo salto, trocando o quadro Ethernet.
5. Se **nenhuma** rota casa, descarta e responde **ICMP Destination Unreachable** (tipo 3, código 0, "net unreachable").

O raciocínio é por especificidade: `10.0.5.20` casa com `/16`, `/24` e `/0`, e o `/24` vence porque descreve o destino com mais precisão. É assim que se abre uma exceção dentro de uma rede grande, ou que se faz **rota de host** (`/32`) para uma única máquina.

### O gateway padrão do host

O host também tem uma tabela, só que pequena: a rede local (rota direta) e uma linha `default via 192.168.0.1`. Para cada pacote, ele faz uma única pergunta: o destino está na minha rede? Se sim, ARP e entrega direta. Se não, entrega ao gateway. Roteadores só encaminham se o **IP forwarding** estiver ligado (`net.ipv4.ip_forward=1`); um Linux comum o traz desligado, e é o primeiro passo para transformá-lo em roteador.

### Rotas e a ida e volta

Roteamento é por pacote e por direção. A resposta pode seguir outro caminho (rota **assimétrica**), e funciona enquanto cada lado tiver uma rota de volta. O erro mais comum é configurar a ida e esquecer a volta: o pacote chega, a resposta se perde, e o sintoma é "sem resposta" sem nenhuma mensagem de erro.

## Na prática

A tabela com busca linear é a implementação mais simples: percorre as rotas, guarda as que casam e fica com a de maior prefixo. Roteadores de borda carregam perto de 1 milhão de rotas e usam estruturas como a **trie binária**, que desce um bit por vez e lembra a última rota vista, com custo fixo de no máximo 32 passos:

```java
import java.util.ArrayList;
import java.util.List;

public class Rotas {
    record Rota(int base, int prefixo, String proximoSalto) {}

    static int paraInt(String ip) {
        int v = 0;
        for (String s : ip.split("[.]")) v = (v << 8) | Integer.parseInt(s);
        return v;
    }

    /** Busca linear: guarda as rotas que casam e fica com o MAIOR prefixo. */
    static class TabelaLinear {
        private final List<Rota> rotas = new ArrayList<>();

        void adicionar(String cidr, String proximoSalto) {
            String[] p = cidr.split("/");
            int prefixo = Integer.parseInt(p[1]);
            int mascara = prefixo == 0 ? 0 : -1 << (32 - prefixo);
            rotas.add(new Rota(paraInt(p[0]) & mascara, prefixo, proximoSalto));
        }

        String proximoSalto(String destino) {
            int ip = paraInt(destino);
            Rota melhor = null;
            for (Rota r : rotas) {
                int mascara = r.prefixo() == 0 ? 0 : -1 << (32 - r.prefixo());
                boolean casa = (ip & mascara) == r.base();
                if (casa && (melhor == null || r.prefixo() > melhor.prefixo())) melhor = r;
            }
            return melhor == null ? "sem rota" : melhor.proximoSalto();
        }
    }

    /** Trie binária: desce um bit por vez e lembra a última rota vista. O(32), não O(n). */
    static class TabelaTrie {
        private static class No {
            No zero, um;
            String proximoSalto; // não nulo se há uma rota que termina neste nó
        }

        private final No raiz = new No();

        void adicionar(String cidr, String proximoSalto) {
            String[] p = cidr.split("/");
            int ip = paraInt(p[0]);
            No no = raiz;
            for (int i = 0; i < Integer.parseInt(p[1]); i++) {
                boolean bit = ((ip >>> (31 - i)) & 1) == 1;
                if (bit) { if (no.um == null) no.um = new No(); no = no.um; }
                else { if (no.zero == null) no.zero = new No(); no = no.zero; }
            }
            no.proximoSalto = proximoSalto;
        }

        String proximoSalto(String destino) {
            int ip = paraInt(destino);
            String melhor = raiz.proximoSalto; // a rota padrão, se existir
            No no = raiz;
            for (int i = 0; i < 32 && no != null; i++) {
                no = ((ip >>> (31 - i)) & 1) == 1 ? no.um : no.zero;
                if (no != null && no.proximoSalto != null) melhor = no.proximoSalto;
            }
            return melhor == null ? "sem rota" : melhor;
        }
    }
}
```

Com as rotas `0.0.0.0/0 → ISP`, `10.0.0.0/16 → R2` e `10.0.5.0/24 → R3`, os destinos `10.0.9.4`, `10.0.5.20` e `198.51.100.7` resultam em R2, R3 e ISP. O exercício do módulo pede exatamente essa busca sobre uma tabela de rotas, com os casos de borda `/0`, `/31` e `/32`.

No terminal, `ip route get 10.0.5.20` mostra **a rota que o kernel escolheria**, com o próximo salto e o IP de origem; é a primeira coisa a rodar diante de um "não chega lá". `ip -s route` e `ip route show table all` ajudam em casos com mais de uma tabela (roteamento por política).

## Armadilhas comuns

- **Achar que a primeira rota da lista vence.** A ordem na tabela não importa; vale o prefixo mais longo.
- **Rota de ida sem rota de volta.** O servidor recebe o pacote, mas a resposta não acha o caminho de volta. Confira as duas direções.
- **Rota padrão duplicada.** Duas interfaces (Wi-Fi e cabo, ou duas VPNs) com `default` e a mesma métrica geram comportamento imprevisível. Ajuste métricas.
- **Prefixos sobrepostos sem querer.** Um `/16` genérico engolindo o tráfego que deveria ir por um `/24` mais específico só funciona se o `/24` existir; sem ele, o tráfego vai pelo lado errado.
- **Esquecer o IP forwarding.** Um Linux sem `ip_forward=1` recebe o pacote e o descarta, em vez de encaminhar.
- **Confundir "destino inalcançável" com "recusado".** `Network is unreachable` no próprio host é falta de rota local; `Destination Net Unreachable` vindo do gateway é falta de rota nele. `Connection refused` já é outra história: a máquina respondeu.
- **Buracos negros (*blackhole*).** Uma rota que aponta para um próximo salto inexistente descarta tudo em silêncio.

## Checklist de domínio

- [ ] Você lê uma saída de `ip route` e identifica rotas diretas, estáticas e a padrão
- [ ] Você aplica o longest prefix match e justifica a rota escolhida para um destino
- [ ] Você explica o que o host decide sozinho e o que delega ao gateway
- [ ] Você diagnostica "sem rota" e "sem volta" com `ip route get` e `traceroute`
- [ ] Você descreve a diferença entre rota estática e dinâmica (OSPF e BGP)

## Para ir além

- [RFC 1812: Requirements for IP Version 4 Routers](https://www.rfc-editor.org/rfc/rfc1812)
- [RFC 4632: Classless Inter-domain Routing (CIDR)](https://www.rfc-editor.org/rfc/rfc4632)
- [RFC 4271: A Border Gateway Protocol 4 (BGP-4)](https://www.rfc-editor.org/rfc/rfc4271)
- [Linux: o comando ip-route](https://man7.org/linux/man-pages/man8/ip-route.8.html)
