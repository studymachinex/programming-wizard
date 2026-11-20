> **Em uma frase:** bulkhead não aumenta a capacidade; ele impede que uma dependência doente consuma a capacidade que pertence às outras.

O nome vem dos navios: compartimentos estanques. Se um alaga, o navio não afunda inteiro. Em software, o compartimento é um limite de concorrência — semáforo, pool ou fila — por dependência. O objetivo é que a falha de um parceiro lento vire latência localizada, não indisponibilidade global.

## O problema

Um serviço atende pedidos e consultas de catálogo. O catálogo começa a responder em 8 segundos. O pool HTTP é compartilhado, então todas as requisições ficam presas esperando o catálogo; as de pedido, que dependem só do banco, também param. Em minutos, o pool esgota, a fila cresce, o health check falha e o orquestrador reinicia o serviço — que volta, recebe a mesma carga e cai de novo.

O problema não é a dependência lenta em si; é o acoplamento de capacidade. Sem partição, o comportamento de um parceiro determina o destino de todos os outros. E uma fila ilimitada na frente do pool só transforma saturação em memória consumida e latência que ninguém espera.

## Como funciona

| Mecanismo | O que limita | Quem espera | Quando usar |
|---|---|---|---|
| Semáforo | Concorrência | A thread chamadora, até o timeout | Proteger um recurso sem criar threads |
| Pool dedicado | Concorrência + fila | Ninguém: devolve `Future` ou rejeita | Isolar dependência bloqueante |
| `@Bulkhead` | Concorrência (+ fila assíncrona) | Rejeita ao encher | Método CDI com `Uni`/`CompletionStage` |
| Fila limitada | Admissão | Rejeita quando cheia | Absorver picos curtos, não incidentes |

O dimensionamento sai da Lei de Little: `L = λ × W`. Se a dependência recebe 40 requisições por segundo e o p99 é 250 ms, a concorrência média é `40 × 0,25 = 10`. Um limite de 8 começa a enfileirar; um de 16 absorve o pico. A conta precisa usar o p99, não a média, e considerar o tempo de fila: a partir do momento em que a taxa de chegada supera a capacidade, a espera cresce sem limite.

A fila não cria capacidade. Ela só adia a rejeição. Um bom tamanho é o que cobre alguns segundos de trabalho, não minutos: se o cliente já desistiu, processar aquele item é desperdício. Prefira rejeitar cedo e devolver um erro claro a aceitar trabalho que não será entregue no prazo.

## Na prática

Um executor dedicado com fila limitada e rejeição explícita:

```java
package com.exemplo.resiliencia;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

public final class DependenciaExecutor implements AutoCloseable {

    private final ThreadPoolExecutor pool;

    public DependenciaExecutor(int concorrencia, int fila) {
        this.pool = new ThreadPoolExecutor(
            concorrencia, concorrencia,
            0L, TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(fila),
            Thread.ofPlatform().name("pagamento-", 0).daemon(true).factory(),
            new ThreadPoolExecutor.AbortPolicy());
    }

    public <T> CompletableFuture<T> executar(Callable<T> tarefa) {
        try {
            return CompletableFuture.supplyAsync(() -> {
                try {
                    return tarefa.call();
                } catch (Exception e) {
                    throw new CompletionException(e);
                }
            }, pool);
        } catch (RejectedExecutionException e) {
            throw new CapacidadeEsgotadaException("pagamento", e);
        }
    }

    public int ativos() {
        return pool.getActiveCount();
    }

    public int naFila() {
        return pool.getQueue().size();
    }

    @Override
    public void close() {
        pool.shutdown();
    }
}
```

`AbortPolicy` é intencional: a rejeição precisa ser visível. `CallerRunsPolicy` parece elegante, mas faz o event loop executar a tarefa e reintroduz o bloqueio que o bulkhead tentava evitar. Se quiser esperar um pouco antes de rejeitar, use `offer` com timeout em uma fila própria, não uma fila maior.

A versão declarativa com SmallRye Fault Tolerance:

```java
import io.smallrye.mutiny.Uni;
import org.eclipse.microprofile.faulttolerance.Bulkhead;

@Bulkhead(value = 8, waitingTaskQueue = 16)
public Uni<Autorizacao> autorizar(Pagamento pagamento) {
    return gateway.autorizar(pagamento);
}
```

`waitingTaskQueue` só vale para invocações assíncronas; um método síncrono é rejeitado na hora ao atingir o limite. Monitore três números: chamadas ativas, tamanho da fila e rejeições. Se a fila vive cheia, o limite está baixo ou a dependência está lenta; aumentar o limite só distribui a dor.

## Armadilhas comuns

- Pool "elástico" sem máximo: a fila infinita esconde a saturação até o OOM.
- Compartilhar o mesmo pool entre banco, HTTP e CPU: um vazamento de latência contamina tudo.
- `CallerRunsPolicy` no event loop: você acabou de criar um bloqueio disfarçado.
- Semáforo sem `release` em `onTermination`: uma falha ou cancelamento vaza a permissão.
- Virtual threads como desculpa para remover todos os limites: conexões, CPU e o parceiro continuam finitos.
- Alertar em CPU e não em fila, rejeição e tempo de espera.

## Checklist de domínio

- [ ] Cada dependência externa tem seu próprio limite de concorrência.
- [ ] Sei calcular a concorrência esperada com Lei de Little usando o p99.
- [ ] Minha fila é limitada e a rejeição é explícita e observável.
- [ ] Sei o que acontece com a requisição quando o bulkhead enche.
- [ ] Meço ativos, na fila, rejeitados e tempo de espera.
- [ ] Entendo por que virtual threads não eliminam o limite do outro lado.

## Para ir além

Leia o guia de fault tolerance do Quarkus sobre bulkhead e o tutorial de virtual threads. Depois simule uma dependência com 5 segundos de latência e prove que os outros endpoints continuam dentro do SLO.

- [Quarkus — SmallRye Fault Tolerance](https://quarkus.io/guides/smallrye-fault-tolerance)
- [Quarkus — Virtual threads](https://quarkus.io/guides/virtual-threads)
- [Java 21 — ThreadPoolExecutor](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
