> **Em uma frase:** dependência lenta não derruba um serviço por erro, derruba por exaustão — circuit breaker, bulkhead e timeout budget impedem que a lentidão de um vizinho consuma todos os seus recursos.

## O problema

O serviço de recomendações é opcional na página de produto. Seu p99 era 80 ms e virou 8 s depois de uma mudança no índice. O serviço de catálogo chama recomendações com 300 requisições por segundo e um pool de 200 threads. Pela Lei de Little, são `300 × 8 = 2.400` requisições em voo; o pool satura, a fila cresce e o catálogo inteiro para. A página que poderia ser servida sem recomendações passa a responder timeout.

O incidente não foi causado pela dependência lenta. Foi causado pela falta de isolamento: uma funcionalidade opcional tinha acesso irrestrito ao recurso mais escasso do serviço.

## Como funciona

### Timeout é orçamento, não número mágico

Todo timeout precisa ser finito e derivado do orçamento do chamador. Se a jornada tem 800 ms, você não pode dar 800 ms a cada uma de três dependências. A conta é:

```
disponível = total - processamento local - folga
paralelo: cada chamada pode usar o disponível
sequencial: disponível / número de chamadas
```

Com 800 ms, 100 ms de processamento local e 100 ms de folga, sobram 600 ms. Duas chamadas em paralelo podem usar 600 ms cada; em série, 300 ms cada. Um timeout maior que o orçamento não protege nada — só transfere o estouro para o cliente.

### Bulkhead: o dano fica contido

Bulkhead separa recursos por dependência: pool de threads, semáforo ou limite de concorrência. Se recomendações tem 40 permissões e o resto do serviço tem as suas, a lentidão dela esgota apenas 40 slots. O catálogo continua atendendo com dados próprios.

A Lei de Little dá o dimensionamento: `L = λ × W`. Com 200 req/s e 300 ms, há 60 chamadas em voo. Para operar a 70% de utilização, você precisa de `60 / 0,7 ≈ 86` permissões; a 90%, 67. Quanto mais perto de 100%, mais a fila cresce de forma não linear. O custo do bulkhead é subutilização e mais um parâmetro para operar.

### Circuit breaker: pare de bater na porta

O breaker observa uma janela de chamadas e muda de estado:

| Estado | Comportamento | Saída |
|---|---|---|
| Closed | Passa chamadas e mede falhas | Abre se a taxa passar do limite |
| Open | Falha em microssegundos, sem chamar | Após espera, vai para half-open |
| Half-open | Deixa passar N sondagens | Sucesso fecha; falha reabre |

Uma configuração defensável: janela de 50 chamadas, mínimo de 20, 50% de falha, 50% de chamadas lentas acima de 400 ms, 10 s aberto e 3 sondagens no half-open. O mínimo importa: com 3 chamadas e 2 falhas, 67% de erro não significa que a dependência quebrou.

```java
import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.bulkhead.BulkheadConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.decorators.Decorators;
import io.github.resilience4j.timelimiter.TimeLimiter;
import io.github.resilience4j.timelimiter.TimeLimiterConfig;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.function.Supplier;

final class ProtecaoRecomendacao {
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    private final CircuitBreaker breaker = CircuitBreaker.of("recomendacoes",
            CircuitBreakerConfig.custom()
                    .slidingWindowSize(50)
                    .minimumNumberOfCalls(20)
                    .failureRateThreshold(50)
                    .slowCallDurationThreshold(Duration.ofMillis(400))
                    .slowCallRateThreshold(50)
                    .waitDurationInOpenState(Duration.ofSeconds(10))
                    .permittedNumberOfCallsInHalfOpenState(3)
                    .build());

    private final Bulkhead bulkhead = Bulkhead.of("recomendacoes",
            BulkheadConfig.custom()
                    .maxConcurrentCalls(40)
                    .maxWaitDuration(Duration.ZERO)
                    .build());

    private final TimeLimiter limite = TimeLimiter.of(
            TimeLimiterConfig.custom().timeoutDuration(Duration.ofMillis(300)).build());

    String buscar(Supplier<String> chamada) {
        try {
            return Decorators.ofCompletionStage(
                            () -> CompletableFuture.supplyAsync(chamada, executor))
                    .withBulkhead(bulkhead)
                    .withTimeLimiter(limite, scheduler)
                    .withCircuitBreaker(breaker) // por fora do limite: lentidão conta como falha
                    .get()
                    .toCompletableFuture()
                    .join();
        } catch (RuntimeException e) {
            return "[]"; // degradação explícita: a página segue sem recomendações
        }
    }
}
```

A ordem importa. O retry deve ficar por fora do breaker; se ficar dentro, cada tentativa conta como uma nova falha e abre o circuito mais rápido do que deveria. O bulkhead fica por dentro para que a chamada nem entre na fila quando não há permissão.

## Na prática

Coloque o breaker por dependência e por instância. Um breaker global compartilhado entre pods não existe; cada processo toma sua decisão com os dados que vê. Monitore estado, taxa de falha, chamadas rejeitadas e tempo em open. Um breaker que abre e ninguém percebe é apenas um 500 mais rápido.

Defina o fallback antes do incidente. Recomendações podem virar lista vazia; preço não pode virar zero; saldo não pode virar "desconhecido". O fallback precisa ser uma decisão de produto documentada, não um `catch` que engole tudo.

```java
import java.time.Duration;

record Planejamento(double rps, Duration p99, double utilizacaoAlvo) {
    // Lei de Little: concorrência média = taxa × tempo de residência.
    int poolNecessario() {
        double emVoo = rps * p99.toMillis() / 1_000.0;
        return (int) Math.ceil(emVoo / utilizacaoAlvo);
    }

    static Duration orcamentoParalelo(Duration total, Duration local, Duration folga) {
        Duration disponivel = total.minus(local).minus(folga);
        if (disponivel.isNegative() || disponivel.isZero()) {
            throw new IllegalArgumentException("orçamento inviável");
        }
        return disponivel;
    }

    static Duration orcamentoSequencial(Duration total, Duration local,
                                        Duration folga, int chamadas) {
        return orcamentoParalelo(total, local, folga).dividedBy(chamadas);
    }

    public static void main(String[] args) {
        var p = new Planejamento(200, Duration.ofMillis(300), 0.70);
        System.out.println(p.poolNecessario()); // 86 slots para 60 chamadas em voo

        Duration paralelo = orcamentoParalelo(
                Duration.ofMillis(800), Duration.ofMillis(100), Duration.ofMillis(100));
        System.out.println(paralelo.toMillis()); // 600 ms por chamada paralela
        System.out.println(orcamentoSequencial(
                Duration.ofMillis(800), Duration.ofMillis(100),
                Duration.ofMillis(100), 2).toMillis()); // 300 ms por chamada em série
    }
}
```

## Armadilhas comuns

- **Timeout maior que o orçamento.** Cada camada dá 2 s e a jornada de 800 ms estoura no cliente. Propague o tempo restante.
- **Breaker sem timeout.** Uma chamada pendurada nunca falha nem conta como lenta; o breaker fica closed enquanto as threads somem.
- **Half-open sem limite.** Liberar todas as chamadas de uma vez recria o pico. Permita poucas sondagens.
- **Bulkhead com pool compartilhado.** Se todas as dependências usam o mesmo executor, não há isolamento nenhum.
- **Fallback silencioso.** Devolver dado velho ou vazio sem métrica esconde a degradação e vira comportamento permanente.
- **Olhar só a média.** p99 de 80 ms com 5% das chamadas em 8 s derruba o pool; meça cauda e saturação.

## Checklist de domínio

- [ ] Você calcula o pool necessário com Lei de Little e headroom
- [ ] Você distribui 800 ms entre processamento local, folga e dependências
- [ ] Você configura breaker com janela, mínimo e half-open
- [ ] Você escolhe entre semáforo e pool de threads por dependência
- [ ] Você define fallback por operação e alerta quando ele é acionado

## Para ir além

- [Resilience4j CircuitBreaker](https://resilience4j.readthedocs.io/en/docs/circuitbreaker.html) — janelas, estados e métricas.
- [Resilience4j Bulkhead](https://resilience4j.readthedocs.io/en/docs/bulkhead.html) — semáforo versus pool de threads.
- [CircuitBreaker (Fowler)](https://martinfowler.com/bliki/CircuitBreaker.html) — o padrão e o custo de operar o estado.
