> **Em uma frase:** um rate limiter distribuído decide, em poucos milissegundos e de forma consistente entre dezenas de instâncias, se cada requisição passa — e continua decidindo alguma coisa sensata quando o coordenador central cai.

## O problema

Uma API pública recebe 100 mil requisições por segundo. Um cliente mal configurado responde por 40% disso e derruba o banco para todos. Você precisa limitar por API key, por rota e por IP, com resposta clara quando o limite estoura, sem adicionar 30 ms ao p99. E o limite tem que valer para o cluster: se cada uma das 80 instâncias aplicar 1.000 req/s localmente, o cliente manda 80 mil e ninguém segurou nada.

O entrevistador quer três decisões: qual algoritmo, onde o contador vive e o que acontece quando ele fica indisponível. "Uso Redis com INCR" não passa da primeira.

## Como funciona

### Requisitos e capacidade

Funcionais: limite por tenant, rota e IP; janela configurável; 429 com `Retry-After`; dashboard de consumo. Não-funcionais: decisão em 2 ms p99, erro máximo de 5%, 99,99% de disponibilidade, 500 tenants × 20 rotas = 10 mil chaves ativas.

100 mil RPS são 100 mil chamadas ao Redis por segundo. Um nó entrega 100–150 mil comandos simples/s, mas um script Lua com hash custa mais; dimensione 30–40 mil ops/s por shard e use quatro shards com réplica. Memória: 10 milhões de chaves × 120 bytes ≈ 1,2 GB — o gargalo é CPU, não disco.

### Algoritmos

| Algoritmo | Memória/chave | Erro na borda | Burst |
|---|---|---|---|
| Janela fixa | 1 contador | até 2x | descontrolado |
| Log deslizante | 1 timestamp/req | zero | controlado |
| Contador deslizante | 2 contadores | ~1% | suave |
| Token bucket | 2 números | zero | até a capacidade |

Token bucket é o padrão: acumula até `capacity`, cada requisição consome um token e a reposição é linear. `capacity=100` e `refill=100/s` permitem rajada de 100 e depois 100/s. Janela fixa é barata, mas deixa um cliente gastar 100 no fim do minuto e 100 no início do próximo: 200 em dois segundos.

### API e dados

O limite é um contrato. Toda resposta leva `RateLimit-Limit`, `RateLimit-Remaining` e `RateLimit-Reset`; o 429 leva `Retry-After`. Sem isso o cliente tenta de novo na hora e você troca excesso por tempestade.

| Método | Rota | Uso |
|---|---|---|
| PUT | `/v1/limits/{tenant}` | define política por rota |
| GET | `/v1/limits/{tenant}` | política e consumo atual |
| GET | `/v1/usage?window=1m` | série para dashboard |

Cada bucket é um hash `rl:{tenant}:{route}` com `tokens` e `ts`, TTL de duas janelas. O TTL não é opcional: sem ele, chaves de clientes que sumiram ficam para sempre.

```
cliente ─► CDN/WAF ─► API gateway
                         ├─► sidecar local (lease de 1s)
                         │        │ recarrega lease
                         │        ▼
                         │   rate-limit service
                         │        │ EVAL
                         │        ▼
                         │   Redis shard 0..3 ─► réplica
                         └─► serviço de negócio
```

O sidecar reserva 1.000 tokens por segundo e gasta localmente, cortando chamadas ao Redis em 10x. O custo é overshoot: 80 pods reservando ao mesmo tempo podem estourar o limite global em até 80 mil tokens na troca. Para pagamento e login, lease pequeno; para leitura, aceite o erro.

```java
import java.time.Duration;
import java.util.List;

public class TokenBucketLimiter {

    public interface Redis { List<Long> eval(String script, String key, String... args); }

    // O script roda inteiro no servidor: ler, decidir e gravar é atômico.
    private static final String SCRIPT = """
        local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
        local cap, rate, now, cost = tonumber(ARGV[1]), tonumber(ARGV[2]),
                                     tonumber(ARGV[3]), tonumber(ARGV[4])
        local tokens = tonumber(b[1]) or cap
        local ts = tonumber(b[2]) or now
        tokens = math.min(cap, tokens + math.max(0, now - ts) * rate)
        local ok = tokens >= cost
        if ok then tokens = tokens - cost end
        redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
        redis.call('PEXPIRE', KEYS[1], 120000)
        return {ok and 1 or 0, math.floor(tokens)}
        """;

    private final Redis redis;
    private final int capacity;
    private final double refillPerMs;

    public TokenBucketLimiter(Redis redis, int capacity, Duration window) {
        this.redis = redis;
        this.capacity = capacity;
        this.refillPerMs = capacity / (double) window.toMillis();
    }

    public Decision acquire(String key, int cost) {
        List<Long> r = redis.eval(SCRIPT, "rl:" + key, String.valueOf(capacity),
            String.valueOf(refillPerMs), String.valueOf(System.currentTimeMillis()),
            String.valueOf(cost));
        boolean allowed = r.get(0) == 1L;
        long retryMs = allowed ? 0 : (long) Math.ceil(cost / refillPerMs);
        return new Decision(allowed, r.get(1), retryMs);
    }

    public record Decision(boolean allowed, long remaining, long retryAfterMs) {}
}
```

Com relógios desalinhados entre pods, um nó adiantado consome tokens que ainda não existem. Em cluster, use o tempo do Redis (`TIME`) dentro do script.

### Falha: aberto ou fechado

| Tráfego | Redis caiu | Motivo |
|---|---|---|
| Catálogo | fail-open + limite local | indisponibilidade dói mais que abuso |
| Login | fail-closed | segura credential stuffing |
| Pagamento | fail-closed | risco financeiro |
| Webhook | fail-open + fila | parceiro não pode perder evento |

Fail-open sem fallback é desligar o limite. O mínimo é bucket local a 70% do limite e load shedding quando a latência subir.

## Na prática

O caminho de uma requisição: o gateway identifica o tenant, o sidecar tenta o lease local; sem lease, chama o serviço, que faz um `EVAL` no shard pelo hash da chave. `allowed=1` segue; `allowed=0` retorna 429 com `Retry-After` calculado pelo custo. O consumo vira evento assíncrono para o dashboard — nunca entra no caminho da decisão.

Rollout: comece em shadow mode, contando o que seria bloqueado sem bloquear. Compare com a taxa de erro real. Só ative depois de ver que os limites não cortam clientes legítimos. Um limite mal calibrado derruba mais receita que o abuso que ele evita.

## Armadilhas comuns

- **`GET` seguido de `SET`.** Duas instâncias leem o mesmo valor e ambas liberam. Use Lua ou comando atômico.
- **Limitar depois do trabalho caro.** O limiter precisa vir antes de autenticar, consultar banco e chamar downstream.
- **Contar requisições rejeitadas.** Se o 429 também incrementa, o cliente punido nunca se recupera.
- **Sem `Retry-After`.** O cliente faz retry imediato e amplifica o pico.
- **Chave sem TTL.** O Redis cresce com tenants que já saíram.
- **Limite só por IP.** NAT de operadora coloca milhares de usuários no mesmo IP; combine com API key.
- **Confiar em `X-Forwarded-For` sem validar a cadeia.** O cliente forja o header e escolhe o próprio balde.

## Checklist de domínio

- [ ] Você compara os quatro algoritmos por memória, precisão e burst
- [ ] Você escreve o script Lua atômico e explica por que `GET`+`SET` falha
- [ ] Você dimensiona shards, memória e o custo do lease local
- [ ] Você escolhe fail-open ou fail-closed por tipo de tráfego
- [ ] Você comunica o limite com headers e `Retry-After`

## Para ir além

- [Redis Docs](https://redis.io/docs/latest/) — scripts, `EVAL` e garantias de atomicidade.
- [Amazon Builders' Library](https://aws.amazon.com/builders-library/) — padrões de resiliência e retry em produção.
- [SRE Book: Handling Overload](https://sre.google/sre-book/handling-overload/) — load shedding e degradação graciosa.
