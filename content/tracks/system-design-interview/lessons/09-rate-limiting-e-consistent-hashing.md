> **Em uma frase:** rate limiting protege a capacidade compartilhada; consistent hashing decide quem guarda cada chave sem remapear o mundo a cada mudança.

## O problema

Sua API recebe 100 mil requisições por segundo. Um cliente mal configurado manda 40 mil e consome quase metade da frota. Os outros clientes começam a ver timeout, o autoscaling adiciona máquinas, e o custo triplica porque um único tenant não sabe fazer backoff. Você precisa de um limite — e ele precisa ser correto quando dezenas de instâncias atendem a mesma chave ao mesmo tempo.

O naive é um contador em memória por instância. Com 100 pods e limite de 1.000 requisições/minuto, cada pod permite 1.000, e o cliente passa 100 mil. O segundo naive é `GET` no Redis, comparar, `SET`. Duas instâncias leem 999, ambas permitem, e o limite estoura. O terceiro é um contador global em uma única chave: funciona, mas vira hot key e ponto único de falha.

Rate limiting distribuído é um problema de atomicidade, não de algoritmo. A escolha do algoritmo define o comportamento de burst; a implementação define se o limite é real. A segunda metade da aula — consistent hashing — resolve o problema complementar: como distribuir as chaves entre nós de forma estável quando a frota muda.

## Como funciona

### Algoritmos

| Algoritmo | Burst | Memória | Precisão |
|---|---|---|---|
| Janela fixa | Até 2x na borda | 1 contador | Baixa |
| Janela deslizante com contador | Suave | 2 contadores | Boa |
| Log deslizante | Exato | O(n) por chave | Alta |
| Token bucket | Até a capacidade | 2 valores | Alta |
| Leaky bucket | Fila suaviza | Fila | Alta, adiciona latência |

**Janela fixa** é um contador que zera a cada minuto. Simples e barata, mas permite 2x o limite na fronteira: 1.000 no fim de uma janela e 1.000 no início da próxima.

**Janela deslizante com contador** pondera a janela anterior e a atual. É o que Redis e Cloudflare usam em muitas implementações: precisão boa com memória constante.

**Token bucket** tem capacidade `C` e repõe `r` tokens por segundo. Cada requisição consome um. Permite rajadas até `C` e limita a média a `r`. É o algoritmo mais comum para APIs porque o burst é uma feature, não um bug. **Leaky bucket** enfileira e libera a taxa constante; bom para suavizar tráfego, ruim para latência.

### Coordenação distribuída

O caminho correto é uma operação atômica no servidor de estado. No Redis, um script Lua que lê o contador, decide, incrementa e define o TTL em uma única execução. Nada de `GET` seguido de `SET` no cliente. Para limites globais, a chave é o tenant ou o usuário, não o pod.

O custo: cada requisição faz uma chamada de rede ao Redis. A 100 mil RPS, você precisa de sharding por chave e de um cluster que aguente. Uma alternativa é um limite local conservador (por exemplo, 20% do global por instância) sincronizado periodicamente com o Redis. Você troca precisão por latência e disponibilidade; o limite global pode ser levemente furado, mas o sistema não cai se o Redis falhar.

Fail-open versus fail-closed é decisão de produto. Se o Redis cair, login e pagamento devem falhar fechado (negar), porque permitir tráfego ilimitado pode derrubar a origem. Leitura de catálogo pode falhar aberto com limites locais e load shedding. Comunique isso no desenho: "em falha do limitador, mantenho 30% da capacidade com limite local e priorizo tráfego autenticado".

Sempre devolva `429` com `Retry-After` e headers de limite (`X-RateLimit-Limit`, `Remaining`, `Reset`). Um 429 sem prazo faz o cliente tentar de novo imediatamente e piorar o problema.

### Consistent hashing

Com `hash(key) % N`, mudar `N` remapeia quase todas as chaves. Em um cache, isso significa um miss storm; em um shard, significa mover dados. Consistent hashing coloca nós e chaves em um anel; cada chave pertence ao primeiro nó no sentido horário. Adicionar um nó move apenas as chaves entre ele e o antecessor — em média `K/N`.

Virtual nodes resolvem o desequilíbrio. Cada nó físico aparece em dezenas ou centenas de posições no anel, suavizando a distribuição e permitindo pesos diferentes por capacidade. Sem vnodes, um nó pode receber o dobro da carga por azar do hash.

```java
import java.util.concurrent.locks.ReentrantLock;

public class TokenBucket {

    private final long capacity;
    private final double refillPerSecond;
    private double tokens;
    private long lastRefillNanos;
    private final ReentrantLock lock = new ReentrantLock();

    public TokenBucket(long capacity, double refillPerSecond) {
        this.capacity = capacity;
        this.refillPerSecond = refillPerSecond;
        this.tokens = capacity;
        this.lastRefillNanos = System.nanoTime();
    }

    public boolean tryAcquire() {
        lock.lock();
        try {
            long now = System.nanoTime();
            double elapsed = (now - lastRefillNanos) / 1_000_000_000.0;
            tokens = Math.min(capacity, tokens + elapsed * refillPerSecond);
            lastRefillNanos = now;
            if (tokens >= 1.0) {
                tokens -= 1.0;
                return true;
            }
            return false;
        } finally {
            lock.unlock();
        }
    }

    public static void main(String[] args) {
        var bucket = new TokenBucket(5, 2);
        for (int i = 0; i < 8; i++) {
            System.out.println("req " + i + " -> " + bucket.tryAcquire());
        }
    }
}
```

```java
import java.util.Map;
import java.util.NavigableMap;
import java.util.TreeMap;

public class ConsistentHashRing {

    private final NavigableMap<Long, String> ring = new TreeMap<>();
    private final int virtualNodes;

    public ConsistentHashRing(int virtualNodes) {
        this.virtualNodes = virtualNodes;
    }

    private long hash(String value) {
        long h = 1125899906842597L;
        for (int i = 0; i < value.length(); i++) {
            h = 31 * h + value.charAt(i);
        }
        return h & Long.MAX_VALUE;
    }

    public void addNode(String node) {
        for (int i = 0; i < virtualNodes; i++) {
            ring.put(hash(node + "#" + i), node);
        }
    }

    public String nodeFor(String key) {
        if (ring.isEmpty()) throw new IllegalStateException("anel vazio");
        Map.Entry<Long, String> entry = ring.ceilingEntry(hash(key));
        return entry != null ? entry.getValue() : ring.firstEntry().getValue();
    }

    public static void main(String[] args) {
        var ring = new ConsistentHashRing(100);
        ring.addNode("cache-a");
        ring.addNode("cache-b");
        ring.addNode("cache-c");
        for (String key : new String[]{"user:1", "user:2", "user:3", "user:4"}) {
            System.out.println(key + " -> " + ring.nodeFor(key));
        }
    }
}
```

## Na prática

Limite global de 100 mil RPS, 10 mil por tenant e 100 por usuário. Um cluster Redis de 10 shards, cada um com réplica, sustenta 100 mil operações/s com folga. A chave é `rl:{scope}:{id}`; o script Lua usa token bucket com capacidade 200 e reposição de 100/s para usuário, e capacidade 20 mil com reposição de 10 mil/s para tenant. O TTL é `capacidade / taxa + margem`.

Cada requisição passa pelo limitador de borda antes de chegar ao serviço. O limite de usuário roda no gateway; o de tenant, no serviço de API; o de recurso caro (busca, exportação) tem um bucket separado. Limites diferentes para operações diferentes evitam que uma exportação pesada consuma a cota de leitura.

Se o Redis de um shard falha, a aplicação usa o bucket local com 20% da cota e ativa load shedding. O sistema perde precisão global por alguns segundos, mas mantém disponibilidade. Para pagamentos, a política é fail-closed: sem limitador, a requisição é rejeitada com 503 e mensagem clara.

Para distribuir as chaves do limitador entre shards, consistent hashing com 150 vnodes evita que a entrada de um shard mova todas as chaves. O mesmo anel é usado pelo cache de sessão. Quando um nó entra, apenas as chaves vizinhas migram; o hit ratio cai um pouco, não desaba.

## Armadilhas comuns

- **`GET` + `SET` no cliente.** É uma race condition. Use Lua, `INCR` com TTL atômico ou um serviço de limite dedicado.
- **Limite por instância chamado de global.** Com N pods, o limite efetivo é N vezes o configurado. Diga qual escopo cada camada protege.
- **Janela fixa para tráfego com burst.** O cliente aprende a concentrar requisições na virada e dobra o limite.
- **Hot key no Redis.** Um tenant gigante em uma única chave satura um shard. Subdivida a chave ou use limite local + global hierárquico.
- **Relógio dessincronizado.** Token bucket baseado em timestamp de cliente ou de nós sem NTP deriva. Use o relógio do servidor de estado ou contadores monotônicos.
- **Fail-open sempre.** Se o limitador cair e você liberar tudo, ele deixa de proteger justamente no incidente.
- **Anel sem virtual nodes.** A distribuição fica irregular e um nó vira hotspot.

## Checklist de domínio

- [ ] Você compara os cinco algoritmos por burst, memória e precisão
- [ ] Você implementa o limite de forma atômica no estado compartilhado
- [ ] Você decide fail-open ou fail-closed por tipo de tráfego
- [ ] Você explica por que `% N` remapeia quase tudo e vnodes resolvem
- [ ] Você calcula a carga de Redis e o número de shards necessário

## Para ir além

- [Scaling your API with rate limiters — Stripe](https://stripe.com/blog/rate-limiters) — algoritmos e decisões de produto em produção.
- [Token Bucket](https://en.wikipedia.org/wiki/Token_bucket) — definição formal e variações.
- [What is Consistent Hashing? — Cloudflare](https://www.cloudflare.com/learning/performance/what-is-consistent-hashing/) — intuição e uso em CDN.
- [Handling Overload — Google SRE](https://sre.google/sre-book/handling-overload/) — load shedding e priorização quando o limite não basta.
