> **Em uma frase:** a borda existe para que o usuário chegue ao servidor certo, perto dele, sem que a origem veja o tráfego que não precisa ver.

## O problema

Uma API recebe 10 milhões de requisições por minuto, cada resposta com 100 KB. Isso é 167 mil requisições por segundo e 134 Gbps de saída. Nenhuma máquina razoável serve isso sozinha; nenhum data center em uma única região entrega latência boa para o mundo inteiro. Se você desenhar "cliente → servidor → banco", a entrevista termina antes do primeiro deep dive.

A borda — DNS, load balancer e CDN — é o que transforma um serviço em um sistema distribuído de verdade. Ela resolve três problemas ao mesmo tempo: **direcionamento** (qual servidor), **distribuição** (quantos servidores) e **proximidade** (qual cópia). Cada uma tem ferramentas diferentes, e confundi-las é uma das armadilhas mais comuns.

O entrevistador quer saber se você entende o caminho real de uma requisição. Não basta dizer "uso CDN"; é preciso explicar o que é cacheado, por quanto tempo, com qual chave, e o que acontece quando o cache não tem o conteúdo.

## Como funciona

### DNS: o primeiro salto

O cliente consulta um resolver, que percorre a hierarquia até o servidor autoritativo do domínio. A resposta tem um TTL e fica cacheada em vários lugares. É por isso que DNS é ótimo para direcionamento geográfico e péssimo para failover rápido: você não controla o cache dos outros.

GeoDNS devolve IPs diferentes conforme a localização do resolver. Anycast anuncia o mesmo IP em várias regiões e deixa o roteamento da internet escolher o ponto mais próximo. Anycast é a base de CDNs e de resolvedores públicos; ele absorve também parte de ataques DDoS, porque o tráfego é espalhado pela rede.

TTL curto aumenta a frequência de consultas e reduz a janela de cache; TTL longo melhora a latência e a resiliência do resolver, mas atrasa mudanças. Para failover de segundos, use o load balancer, não o DNS. Para migração planejada, DNS com TTL de alguns minutos é adequado.

### Load balancer: L4 ou L7

| Aspecto | L4 (TCP/UDP) | L7 (HTTP) |
|---|---|---|
| O que vê | IP, porta, protocolo | path, header, cookie, método |
| Custo por conexão | Baixo | Maior (termina TLS, parseia HTTP) |
| Roteamento | Por conexão | Por requisição |
| Uso típico | Banco, WebSocket, entrada de alto volume | APIs, canary, auth, rate limit |

Algoritmos importam. Round robin funciona quando as requisições custam o mesmo. Least connections lida melhor com cauda longa. Consistent hashing preserva cache local por chave. Power of two choices (escolher duas máquinas aleatórias e mandar para a menos carregada) é uma solução barata e robusta para evitar filas em um único nó.

Health check precisa testar a dependência certa. Um `/health` que só retorna 200 porque o processo está vivo mantém no pool uma instância sem banco. Separe liveness (processo vivo) de readiness (pode receber tráfego) e inclua uma checagem funcional leve. Connection draining evita derrubar requisições em andamento durante deploy.

### CDN: cache perto do usuário

CDN é uma rede de caches reversos. No modelo pull, o edge busca do origin no primeiro miss e cacheia conforme os headers. No push, você envia o conteúdo antecipadamente. Pull é o padrão para web; push faz sentido para lançamentos de software e vídeo.

A cache key é a decisão mais importante. Por padrão, método + URL + host. Se você inclui `Authorization` ou cookies, o hit ratio despenca; se ignora `Accept-Encoding`, pode servir gzip para quem não suporta. Conteúdo personalizado não deve ser cacheado no edge sem uma chave que separe usuários — e, na prática, muitas vezes não deve ser cacheado ali.

Headers controlam o comportamento: `Cache-Control: public, max-age=3600, stale-while-revalidate=60` permite servir uma cópia velha enquanto revalida em background. `s-maxage` fala com CDNs. `Vary` correto evita misturar variantes. Invalidação por purge é cara e lenta; prefira versionar a URL (`app.abc123.js`) em vez de purgar.

```java
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public class LeastConnectionsBalancer {

    public record Backend(String id, String zone, int weight) {}

    private final List<Backend> backends;
    private final Map<String, AtomicInteger> active = new ConcurrentHashMap<>();

    public LeastConnectionsBalancer(List<Backend> backends) {
        this.backends = List.copyOf(backends);
        backends.forEach(b -> active.put(b.id(), new AtomicInteger()));
    }

    public Backend pick() {
        return backends.stream()
            .filter(b -> !b.zone().equals("offline"))
            .min(Comparator.comparingInt((Backend b) -> active.get(b.id()).get() / b.weight()))
            .orElseThrow(() -> new IllegalStateException("nenhum backend saudável"));
    }

    public void begin(Backend backend) { active.get(backend.id()).incrementAndGet(); }
    public void end(Backend backend) { active.get(backend.id()).decrementAndGet(); }

    public static void main(String[] args) {
        var lb = new LeastConnectionsBalancer(List.of(
            new Backend("api-1", "us-east-1a", 2),
            new Backend("api-2", "us-east-1b", 2),
            new Backend("api-3", "us-east-1c", 1)
        ));
        for (int i = 0; i < 10; i++) {
            var chosen = lb.pick();
            lb.begin(chosen);
            System.out.println("requisição " + i + " -> " + chosen.id());
        }
    }
}
```

```java
public class CachePolicy {

    public enum Content { STATIC_ASSET, PRODUCT_PAGE, USER_FEED, PAYMENT_STATUS }

    public record Policy(String cacheControl, int edgeTtlSeconds, boolean cacheable) {}

    public static Policy forContent(Content content) {
        return switch (content) {
            case STATIC_ASSET -> new Policy("public, max-age=31536000, immutable", 31_536_000, true);
            case PRODUCT_PAGE -> new Policy("public, s-maxage=300, stale-while-revalidate=60", 300, true);
            case USER_FEED -> new Policy("private, no-store", 0, false);
            case PAYMENT_STATUS -> new Policy("private, no-store", 0, false);
        };
    }

    public static void main(String[] args) {
        for (Content c : Content.values()) {
            System.out.printf("%-15s cacheable=%s ttl=%ds%n",
                c, forContent(c).cacheable(), forContent(c).edgeTtlSeconds());
        }
    }
}
```

## Na prática

Volte ao cenário de 167 mil RPS e 134 Gbps. Uma arquitetura de borda plausível:

- Anycast + GeoDNS levam o usuário ao PoP mais próximo.
- 95% do conteúdo estático e das respostas públicas ficam no CDN. A origem recebe 5% — 8.350 RPS, 6,7 Gbps —, ainda muito para um servidor, mas viável para um cluster com autoscaling.
- L7 na entrada para TLS, roteamento por path, rate limit e canary. L4 na frente dos WebSockets e do banco, porque L7 não agrega valor ali.
- Origin shield concentra os misses em uma região, evitando que 30 PoPs façam a mesma pergunta ao banco ao mesmo tempo.
- Assets com hash no nome têm TTL de um ano e `immutable`; HTML tem TTL curto; feed e pagamento são `no-store`.

O número que fecha a conta é o hit ratio. Se o CDN entrega 95%, a origem vê 5%. Se cai para 80% em um incidente, a origem vê 33 mil RPS e provavelmente cai. Por isso o hit ratio é um SLO operacional, e o origin shield + stale-while-revalidate são proteções, não luxo.

Failover: se uma região morre, o DNS pode apontar para outra, mas a propagação leva minutos. O load balancer global com health check e anycast tira a região em segundos. Ainda assim, capacidade ociosa precisa existir: failover sem headroom é apenas mudar o endereço do incidente.

## Armadilhas comuns

- **Usar DNS como failover de segundos.** Resolvers cacheiam. Para RTO de segundos, o controle precisa estar no balanceador ou no roteamento anycast.
- **Sticky sessions por padrão.** Elas quebram autoscaling e concentram carga. Prefira estado externo (Redis, banco) e balanceamento sem afinidade, a menos que o protocolo exija.
- **Cachear conteúdo personalizado no CDN.** Um erro de cache key pode servir o feed de uma pessoa para outra. Teste com usuários distintos e headers `Vary` corretos.
- **Health check raso.** Processo vivo sem dependência pronta recebe tráfego e falha. Liveness e readiness são coisas diferentes.
- **Achar que CDN resolve origem lenta.** CDN reduz volume e latência de cache hit; no miss, sua origem ainda precisa responder. Origin shield e request collapsing é que evitam a avalanche.
- **Ignorar `X-Forwarded-For`.** Atrás de proxy, o IP do cliente não é o da conexão. Não confie no header sem validar a cadeia de proxies.

## Checklist de domínio

- [ ] Você explica o caminho DNS → anycast → CDN → load balancer → serviço
- [ ] Você escolhe L4 ou L7 com critério e sabe o custo de cada um
- [ ] Você define cache key, TTL e invalidação para três tipos de conteúdo
- [ ] Você calcula a carga na origem a partir do hit ratio
- [ ] Você sabe por que DNS não é um bom failover rápido

## Para ir além

- [What is a CDN? — Cloudflare](https://www.cloudflare.com/learning/cdn/what-is-a-cdn/) — fundamentos de cache de borda e topologia.
- [What is DNS? — Cloudflare](https://www.cloudflare.com/learning/dns/what-is-dns/) — resolução, TTL e tipos de registro.
- [NGINX HTTP Load Balancing](https://docs.nginx.com/nginx/admin-guide/load-balancer/http-load-balancer/) — algoritmos e health checks em configuração real.
- [HTTP Caching — MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching) — a referência definitiva de headers e semântica.
