> **Em uma frase:** cache não é um banco mais rápido; é uma cópia descartável que você aceita manter desatualizada por um tempo em troca de latência e dinheiro.

## O problema

Seu banco responde em 20 ms no p99 e recebe 50 mil QPS. A conta é simples: 50 mil × 20 ms = 1.000 requisições concorrentes, conexões demais, CPU no limite. Você coloca Redis na frente e o p99 cai para 2 ms, o banco vê 5% do tráfego. A latência melhora, o custo cai, e aí começa a parte difícil: um usuário atualiza o preço e continua vendo o valor antigo; uma chave quente expira e 10 mil requisições vão ao banco ao mesmo tempo; o Redis reinicia e a origem recebe todo o tráfego de uma vez.

Cache é fácil de adicionar e difícil de operar bem. A pergunta de entrevista não é "você usaria cache?" — quase sempre sim —, mas "o que exatamente você cacheia, com qual chave, por quanto tempo, como invalida e o que acontece quando ele falha?". Quem responde só "Redis" mostra ferramenta sem modelo mental.

O objetivo é reduzir latência e carga sem transformar o cache na fonte da verdade. Toda vez que você ganha um hit, está aceitando o risco de servir algo velho. Esse risco precisa ser explícito.

## Como funciona

### As camadas

| Camada | Latência típica | O que guarda | Invalidação |
|---|---|---|---|
| Browser | 0 ms (local) | assets, respostas HTTP | TTL, versão na URL |
| CDN | 10–50 ms | conteúdo público | TTL, purge, versão |
| App local | 100 ns–1 ms | objetos quentes, configs | TTL curto, evento |
| Redis/memcached | 0,5–2 ms | sessões, contadores, objetos | TTL, delete, versão |
| Buffer pool do banco | 0,1–1 ms | páginas lidas | LRU do próprio banco |

Cada camada tem um dono e um custo. Browser e CDN são baratos e escalam; cache local é rapidíssimo, mas cada instância tem sua cópia; Redis é compartilhado, mas vira dependência de rede. O buffer pool do banco não é "cache da aplicação": você não controla a política e não deve contar com ele para absorver picos.

### Padrões

**Cache-aside** é o padrão. A aplicação lê o cache; no miss, lê o banco, grava no cache e retorna. Simples, resiliente a falha do cache (basta ir ao banco) e fácil de entender. O risco é a corrida: duas requisições dão miss, ambas leem o banco, uma grava um valor antigo depois da outra. Versione o valor ou delete após a escrita.

**Write-through** grava no cache e no banco na mesma operação. Consistência melhor, latência de escrita maior e cache com dados que talvez nunca sejam lidos. **Write-behind** grava no cache e persiste depois, em background; ótimo para contadores, perigoso para dinheiro. **Refresh-ahead** atualiza antes de expirar; reduz misses de chaves quentes, mas pode desperdiçar trabalho.

### Dimensionamento

Cache se dimensiona pelo **working set**, não pelo catálogo. Se você tem 500 GB de produtos e 80% dos acessos vão para 10% dos itens, 50 GB cobrem a maior parte com folga. Meça hit ratio e custo por hit. Um cache de 50 GB com 95% de hit pode ser melhor que 500 GB com 97%, porque o segundo custa dez vezes mais e alivia pouco o banco.

Políticas de eviction: LRU é o padrão; LFU lida melhor com chaves que continuam populares; TTL é obrigatório para dados que mudam. Use TTL com jitter (por exemplo, 300 s ± 10%) para evitar que milhares de chaves expirem no mesmo segundo. Para chaves quentes, cache local na frente do Redis ou replicação da chave em vários nós.

### As quatro falhas clássicas

1. **Stampede:** uma chave quente expira e muitas requisições vão ao banco. Defesa: single-flight (uma requisição recalcula, as outras esperam), lock por chave, stale-while-revalidate.
2. **Penetração:** requisições para chaves inexistentes passam direto ao banco. Defesa: cache de valor nulo com TTL curto e, para volumes grandes, Bloom filter.
3. **Avalanche:** muitas chaves expiram juntas ou o cache inteiro cai. Defesa: TTL jitter, circuit breaker no banco, cache local de emergência, pré-aquecimento.
4. **Hot key:** uma chave recebe tráfego desproporcional. Defesa: cache local, dividir a chave em réplicas com sufixo, ou pré-calcular o valor.

```java
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.function.Function;

public class CacheAsideStore<V> {

    public record Entry<V>(V value, long expiresAtMillis) {
        boolean expired(long now) { return now >= expiresAtMillis; }
    }

    private final ConcurrentMap<String, Entry<V>> cache = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, CompletableFuture<V>> inFlight = new ConcurrentHashMap<>();
    private final Function<String, V> loader;
    private final long ttlMillis;

    public CacheAsideStore(Function<String, V> loader, long ttlMillis) {
        this.loader = loader;
        this.ttlMillis = ttlMillis;
    }

    public V get(String key) {
        long now = System.currentTimeMillis();
        Entry<V> entry = cache.get(key);
        if (entry != null && !entry.expired(now)) {
            return entry.value();
        }
        // single-flight: apenas uma thread recarrega a mesma chave
        CompletableFuture<V> mine = new CompletableFuture<>();
        CompletableFuture<V> existing = inFlight.putIfAbsent(key, mine);
        if (existing != null) {
            return existing.join();
        }
        try {
            V value = loader.apply(key);
            cache.put(key, new Entry<>(value, now + ttlMillis));
            mine.complete(value);
            return value;
        } catch (RuntimeException e) {
            mine.completeExceptionally(e);
            throw e;
        } finally {
            inFlight.remove(key, mine);
        }
    }

    public void invalidate(String key) { cache.remove(key); }

    public static void main(String[] args) {
        var store = new CacheAsideStore<String>(k -> "valor-de-" + k, 60_000);
        System.out.println(store.get("produto:42"));
        System.out.println(store.get("produto:42"));
        store.invalidate("produto:42");
        System.out.println(store.get("produto:42"));
    }
}
```

```java
import java.util.concurrent.ThreadLocalRandom;

public class TtlPolicy {

    public record Ttl(long baseSeconds, double jitterRatio) {
        public long nextSeconds() {
            long jitter = Math.round(baseSeconds * jitterRatio);
            return baseSeconds + ThreadLocalRandom.current().nextLong(-jitter, jitter + 1);
        }
    }

    public static Ttl forContent(String type) {
        return switch (type) {
            case "product" -> new Ttl(300, 0.10);
            case "session" -> new Ttl(1_800, 0.05);
            case "config" -> new Ttl(60, 0.20);
            case "negative" -> new Ttl(30, 0.00);
            default -> throw new IllegalArgumentException("tipo desconhecido: " + type);
        };
    }

    public static void main(String[] args) {
        Ttl ttl = forContent("product");
        for (int i = 0; i < 5; i++) {
            System.out.println("expira em " + ttl.nextSeconds() + "s");
        }
    }
}
```

## Na prática

Catálogo de produtos: 10 milhões de itens, 10 KB cada, 100 GB no total. 5% dos itens concentram 80% dos acessos, então o working set é 5 GB. Um cluster Redis de três nós com 16 GB cada, replicação, cabe com folga. O hit ratio esperado é 95%; a origem vê 2.500 QPS em vez de 50 mil.

Fluxo de leitura: `GET product:{id}`. No miss, busca no Postgres, serializa e grava com TTL de 300 s. Fluxo de escrita: atualiza o banco, commita, então deleta a chave. Por que deletar e não atualizar? Porque duas escritas concorrentes podem gravar no cache fora de ordem; deletar força a próxima leitura a buscar o valor atual. Ainda assim existe uma janela: uma leitura pode buscar o valor antigo antes do commit e gravar depois do delete. Para preço, use versionamento (`product:{id}:v{n}`) ou invalidação via CDC.

Se o Redis cair, a aplicação precisa continuar. O cache-aside já permite ir ao banco, mas 50 mil QPS não cabem. A proteção é um circuit breaker que degrada features não essenciais, um cache local de curta duração e um limite de concorrência no banco. "Cache é opcional" só é verdade se a origem aguentar o tranco; geralmente não aguenta.

## Armadilhas comuns

- **Tratar o cache como fonte da verdade.** Se o Redis é o único lugar onde o dado existe, você tem um banco caro e sem durabilidade.
- **Invalidar antes do commit.** Outra leitura pode repopular o cache com o valor antigo. Delete depois do commit e aceite a janela, ou use CDC/versão.
- **TTL uniforme.** Milhões de chaves expirando no mesmo instante criam avalanche. Jitter é obrigatório.
- **Cachear decisão de autorização sem versão.** Permissão revogada continua valendo até o TTL. Use TTL curto e invalidação por evento.
- **Ignorar hot keys.** Uma chave de campanha pode receber 30% do tráfego. Monitore e prepare cache local ou split.
- **Não medir hit ratio por tipo de conteúdo.** Um hit ratio global de 90% pode esconder 40% no endpoint mais caro.

## Checklist de domínio

- [ ] Você escolhe a camada de cache certa para cada tipo de dado
- [ ] Você explica cache-aside, write-through e write-behind com seus riscos
- [ ] Você dimensiona cache por working set e hit ratio
- [ ] Você previne stampede, penetração, avalanche e hot key
- [ ] Você define o que acontece quando o cache cai

## Para ir além

- [Caching Challenges and Strategies — AWS Builders' Library](https://aws.amazon.com/builders-library/caching-challenges-and-strategies/) — falhas reais e padrões de mitigação.
- [Redis Documentation](https://redis.io/docs/latest/) — comandos, TTL, eviction e operação de cluster.
- [Caffeine Wiki](https://github.com/ben-manes/caffeine/wiki) — cache local de alta performance em Java e políticas de eviction.
- [HTTP Caching — MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching) — cache de browser e CDN com semântica correta.
