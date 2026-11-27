> **Em uma frase:** o NAT troca o IP e a porta de origem dos pacotes que saem, guarda a troca numa tabela e a desfaz na resposta; assim muitos aparelhos com IP privado dividem um endereço público, ao custo de estado, de timeouts e de um número finito de portas.

## O problema

O IPv4 tem cerca de 4,3 bilhões de endereços, e já existem mais aparelhos que isso. A solução que sustentou a internet por 30 anos foi não dar um IP público a cada aparelho: a casa inteira sai por um só, e dentro dela todos usam endereços privados. Isso funciona tão bem que muita gente nunca percebe, até o dia em que um backend:

- vê o mesmo IP de origem para mil usuários diferentes, e o rate limit por IP bloqueia um escritório inteiro;
- abre conexões demais para a mesma API e começa a receber timeouts intermitentes, porque as portas do NAT gateway acabaram;
- tem conexões "mortas" depois de ficar ocioso, porque a entrada do NAT expirou e o servidor não sabe.

Os três casos são o NAT trabalhando como projetado. Entender a tabela de tradução evita horas de depuração.

## Como funciona

Os endereços privados (RFC 1918) não são roteados na internet. Um pacote que sai de `192.168.0.23` até teria caminho de ida, mas o servidor responderia a um endereço que milhões de redes usam. A resposta se perderia. O roteador de borda resolve **reescrevendo a origem**.

O tipo mais comum é o **NAPT** (também PAT ou *masquerade*): traduz **IP e porta**. Para a conexão do celular a `198.51.100.10:443`:

```text
Saída:   192.168.0.23:51514  →  203.0.113.45:40001        (origem reescrita)
Tabela:  192.168.0.23:51514 ⇄ 203.0.113.45:40001  com  198.51.100.10:443
Volta:   198.51.100.10:443 → 203.0.113.45:40001  vira  → 192.168.0.23:51514
```

A porta é o que permite que muitos aparelhos dividam o IP. Se o notebook escolher a mesma porta de origem (`51514`), o roteador dá a ele outra externa (`40002`). A conversa é identificada pela combinação de IP e porta externos, IP e porta do destino e protocolo.

Propriedades que decorrem disso:

- **Com estado.** O NAT precisa lembrar cada conversa. No Linux, a tabela é o **conntrack** (`conntrack -L`); cada entrada tem um **timeout**: UDP ocioso expira em torno de 30 s (120 s com tráfego nos dois sentidos) e TCP estabelecido em 5 dias (432000 s), valores ajustáveis por `nf_conntrack_*`. Provedores de nuvem usam valores próprios, por vezes bem menores, como 350 s no NAT Gateway da AWS.
- **Unidirecional por padrão.** Só pacotes que casam com uma entrada criada de dentro passam. Quem chega de fora, sem convite, é descartado. É um efeito colateral útil, mas **NAT não é firewall**.
- **Port forwarding (DNAT).** Para publicar um serviço interno, cria-se uma entrada fixa: `203.0.113.45:443 → 192.168.0.50:443`. É o que `docker run -p`, NodePort e muitos roteadores domésticos fazem por baixo.
- **Quebra a transparência ponta a ponta.** Protocolos que carregam IPs no payload (FTP ativo, SIP) precisam de ajuda (ALG), e o P2P precisa de truques como STUN.

**CGNAT** é o NAT da operadora: o seu roteador recebe um IP do bloco `100.64.0.0/10` (RFC 6598) e a operadora o traduz de novo. Dois NATs em cascata impedem port forwarding. O **IPv6**, com endereços para todos, retira a necessidade de NAT.

## Na prática

Duas consequências diretas para o código de um backend.

**1. O IP que o servidor vê.** `socket.getRemoteSocketAddress()` devolve o endereço visto por ele, o do NAT ou do balanceador, e não o do usuário. Por trás de proxies, o IP real vem num cabeçalho (`X-Forwarded-For`, `Forwarded`), que só deve ser confiado se vier de um proxy seu, caso contrário o cliente o forja.

**2. A tabela de tradução em miniatura.** O código abaixo reproduz o NAT acima: reescreve a origem na saída, resolve a volta por (porta externa, remoto) e descarta o que ninguém iniciou. Repare em como o `Optional.empty` corresponde ao pacote barrado:

```java
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public class Nat {
    record Endpoint(String ip, int porta) {
        @Override public String toString() { return ip + ":" + porta; }
    }

    /** Chave da conversa vista de fora: porta externa + quem está do outro lado. */
    record Chave(int portaExterna, Endpoint remoto) {}

    private final String ipPublico;
    private final Map<Endpoint, Integer> porSaida = new HashMap<>();   // um mapeamento por endpoint interno
    private final Map<Chave, Endpoint> porEntrada = new HashMap<>();
    private int proximaPorta = 40_001;

    Nat(String ipPublico) { this.ipPublico = ipPublico; }

    /** Pacote saindo: reescreve a ORIGEM (IP e porta) e guarda a tradução. */
    Endpoint saida(Endpoint interno, Endpoint remoto) {
        int porta = porSaida.computeIfAbsent(interno, i -> proximaPorta++);
        porEntrada.put(new Chave(porta, remoto), interno);
        return new Endpoint(ipPublico, porta);
    }

    /** Pacote chegando: reescreve o DESTINO, mas só se houver conversa iniciada de dentro. */
    Optional<Endpoint> entrada(int portaExterna, Endpoint remoto) {
        return Optional.ofNullable(porEntrada.get(new Chave(portaExterna, remoto)));
    }

    public static void main(String[] args) {
        Nat nat = new Nat("203.0.113.45");
        Endpoint servidor = new Endpoint("198.51.100.10", 443);
        Endpoint celular = new Endpoint("192.168.0.23", 51514);
        Endpoint notebook = new Endpoint("192.168.0.31", 51514); // mesma porta de origem!

        System.out.println(celular + " -> " + nat.saida(celular, servidor));   // 203.0.113.45:40001
        System.out.println(notebook + " -> " + nat.saida(notebook, servidor)); // 203.0.113.45:40002
        System.out.println(nat.entrada(40001, servidor));                      // Optional[192.168.0.23:51514]
        System.out.println(nat.entrada(8080, new Endpoint("192.0.2.99", 4444))); // Optional.empty
    }
}
```

A versão real também expira entradas por tempo e limita o número de portas. Na nuvem, o **NAT Gateway** suporta cerca de 55 mil conexões simultâneas para cada destino único (IP, porta e protocolo). Um serviço que abre uma conexão nova por chamada ao mesmo endpoint esgota isso: a solução é **reusar conexões** (keep-alive e pool, aula 23) ou distribuir por mais IPs.

Para olhar de perto, num roteador Linux: `sudo conntrack -L` (as traduções ativas), `sudo iptables -t nat -S` (regras `MASQUERADE` e `DNAT`) e `curl -s https://ifconfig.me` (o IP público visto de fora).

## Armadilhas comuns

- **Rate limit por IP atrás de NAT.** Um escritório, um campus ou uma operadora com CGNAT dividem poucos IPs. Limite também por conta, por chave de API ou por token.
- **Confiar em `X-Forwarded-For` sem filtro.** O cliente pode enviá-lo. Aceite o cabeçalho apenas do proxy confiável e use a entrada mais à direita que ele acrescentou.
- **Conexão ociosa que "morre" calada.** A entrada do NAT expirou e o próximo pacote é descartado. Use TCP keepalive menor que o timeout do NAT, e `SO_KEEPALIVE` ou ping na aplicação.
- **Esgotar portas do NAT.** Muitas conexões curtas ao mesmo destino acabam com a faixa de portas. Reuse conexões; observe a métrica `ErrorPortAllocation` do NAT Gateway da AWS.
- **Tratar NAT como firewall.** Ele barra o tráfego não solicitado como efeito colateral, mas não filtra o que sai nem substitui regras de segurança.
- **Publicar serviço atrás de CGNAT.** Sem IP público, não há port forwarding. Use um túnel reverso ou uma VPS.

## Checklist de domínio

- [ ] Você explica por que IPs privados precisam de NAT para falar com a internet
- [ ] Você descreve a tradução de saída e de volta, indicando o que é reescrito em cada direção
- [ ] Você explica por que a porta é essencial e como o NAT resolve duas origens com a mesma porta
- [ ] Você conhece os limites do NAT: estado, timeouts, portas e CGNAT
- [ ] Você trata IP de origem e rate limit corretamente em um backend atrás de proxies e NAT

## Para ir além

- [RFC 3022: Traditional IP Network Address Translator](https://www.rfc-editor.org/rfc/rfc3022)
- [RFC 2663: IP Network Address Translator (NAT) Terminology and Considerations](https://www.rfc-editor.org/rfc/rfc2663)
- [RFC 6598: IANA-Reserved IPv4 Prefix for Shared Address Space](https://www.rfc-editor.org/rfc/rfc6598)
- [RFC 7239: Forwarded HTTP Extension](https://www.rfc-editor.org/rfc/rfc7239)
- [AWS: NAT gateways](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
