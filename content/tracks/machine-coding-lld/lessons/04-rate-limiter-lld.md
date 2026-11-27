> **Em uma frase:** escolher o algoritmo de rate limit é escolher entre memória, precisão e tolerância a rajadas, e na entrevista a justificativa vale tanto quanto o código.

## O problema

"Implemente um rate limiter e explique por que escolheu essa estrutura de dados" é a pergunta como ela chega. A parte do código é curta. A conversa é o que decide: o entrevistador quer ouvir quanto de memória cada algoritmo gasta com um milhão de clientes, o que acontece na fronteira de uma janela fixa e qual dos algoritmos permite que um cliente legítimo mande dez requisições de uma vez depois de ficar parado.

## Como funciona

Os quatro algoritmos clássicos, com o custo por cliente para um limite de 1.000 req/min:

| Algoritmo | Memória por cliente | Precisão | Rajada |
|---|---|---|---|
| Janela fixa | 1 contador + início | Ruim na fronteira | Até 2x o limite |
| Sliding window log | Até 1.000 timestamps (~8 KB) | Exata | Não permite |
| Sliding window counter | 2 contadores | Aproximada (~ponderada) | Pequena |
| Token bucket | 2 números | Exata para a taxa | Até a capacidade |

**Janela fixa** conta requisições por minuto do relógio. O problema é a fronteira: 1.000 requisições às 10:00:59 e mais 1.000 às 10:01:00 passam. São 2.000 em dois segundos.

**Sliding window log** guarda o instante de cada requisição aceita e conta as que caem em `(agora - janela, agora]`. É exato, mas a memória cresce com o limite: com 1 milhão de clientes, são até 8 GB.

**Token bucket** guarda só quantos tokens há e quando foi a última recarga. Os tokens são recalculados **sob demanda**, a partir do tempo decorrido, sem thread nem timer. É o que AWS API Gateway e Stripe usam, porque permite rajadas controladas (a capacidade) mantendo a taxa média.

```java
import java.util.*;
import java.util.function.LongSupplier;

interface RateLimiter { boolean allow(String clienteId); }

class TokenBucket implements RateLimiter {
    private static final class Balde { double tokens; long ultima; Balde(double t, long u) { tokens = t; ultima = u; } }

    private final int capacidade;
    private final double porSegundo;
    private final LongSupplier relogio;
    private final Map<String, Balde> baldes = new HashMap<>();

    TokenBucket(int capacidade, double porSegundo, LongSupplier relogio) {
        this.capacidade = capacidade; this.porSegundo = porSegundo; this.relogio = relogio;
    }

    public synchronized boolean allow(String id) {
        long agora = relogio.getAsLong();
        Balde b = baldes.computeIfAbsent(id, k -> new Balde(capacidade, agora));
        long decorrido = Math.max(0, agora - b.ultima);        // relógio voltando não gera tokens
        b.tokens = Math.min(capacidade, b.tokens + decorrido * porSegundo / 1000.0);
        b.ultima = Math.max(b.ultima, agora);
        if (b.tokens < 1) return false;
        b.tokens -= 1;
        return true;
    }
}
```

O sliding window log é a resposta quando o requisito é "nunca mais de N em qualquer intervalo de T", como em limite de tentativas de login:

```java
class SlidingWindowLog implements RateLimiter {
    private final int limite;
    private final long janela;
    private final LongSupplier relogio;
    private final Map<String, ArrayDeque<Long>> logs = new HashMap<>();

    SlidingWindowLog(int limite, long janela, LongSupplier relogio) {
        this.limite = limite; this.janela = janela; this.relogio = relogio;
    }

    public synchronized boolean allow(String id) {
        long agora = relogio.getAsLong();
        ArrayDeque<Long> log = logs.computeIfAbsent(id, k -> new ArrayDeque<>());
        while (!log.isEmpty() && log.peekFirst() <= agora - janela) log.pollFirst(); // O(1) amortizado
        if (log.size() >= limite) return false;
        log.addLast(agora);
        return true;
    }
}
```

## Na prática

- **Justifique pela necessidade, não pela moda.** API pública com clientes que mandam lotes: token bucket. Proteção contra força bruta: sliding window log com limite baixo (5 tentativas em 15 minutos custa 5 timestamps). Limite de alto volume e barato: sliding window counter.
- **Recusadas não entram no log.** Senão, um cliente que insiste fica bloqueado para sempre, porque cada tentativa recusada empurra a janela para frente.
- **Ponto flutuante.** `decorrido * taxa / 1000.0` é exato para os casos redondos. Taxa por milissegundo pré-calculada (`2 / 1000.0`) acumula erro. Alternativa robusta: guardar tokens em milésimos, como inteiro.
- **Memória de clientes inativos.** O mapa cresce com cada `clienteId` já visto. Em produção, os baldes ficam num cache com expiração (a aula do KV com TTL) ou no Redis com TTL igual ao tempo de encher o balde.
- **Resposta HTTP.** Recusa é `429 Too Many Requests` com `Retry-After`. O token bucket sabe calcular esse valor: `(1 - tokens) / taxa`.

## Armadilhas comuns

- **Timer que recarrega todos os baldes a cada segundo.** São um milhão de escritas por segundo para nada. Calcule sob demanda.
- **`HashMap` sem sincronização num servidor web.** Duas threads no `computeIfAbsent` de um `HashMap` comum corrompem o mapa. Use `synchronized`, `ConcurrentHashMap` com lock por balde ou `compute` atômico.
- **Confundir local com distribuído.** Esta implementação limita **por processo**. Com 10 instâncias atrás de um balanceador, o limite efetivo vira 10x. O estado precisa ir para o Redis com script Lua atômico, o que é assunto da trilha de system design.

## Checklist de domínio

- [ ] Você compara os quatro algoritmos em memória, precisão e rajada
- [ ] Você implementa token bucket sem timer
- [ ] Você explica a falha da janela fixa na fronteira com números
- [ ] Você sabe dizer o que muda quando o limiter fica distribuído

## Para ir além

- [Stripe: Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters): os quatro tipos de limiter que a Stripe usa em produção.
- [Cloudflare: How we built rate limiting capable of scaling to millions of domains](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/): o sliding window counter em escala.
- [Bucket4j](https://github.com/bucket4j/bucket4j): a biblioteca Java de token bucket, incluindo backends distribuídos.
