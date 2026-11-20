> **Em uma frase:** thread pool não é um número mágico — é uma política de admissão, fila e rejeição que precisa caber na memória e no tempo de resposta.

`Executors.newFixedThreadPool(10)` parece innocente, mas esconde uma fila ilimitada. Sob carga, a fila cresce, a latência explode e o processo morre por OOM — ou pior, continua aceitando trabalho que nunca será processado a tempo.

## O problema

Um endpoint recebe 1.000 req/s e cada tarefa leva 200 ms. Com 10 threads, a capacidade é 50 tarefas/s. A fila acumula 950 tarefas por segundo. Em minutos, o heap acaba. O pool precisa de limite, fila limitada e uma política explícita para quando não há capacidade.

## Como funciona

`ThreadPoolExecutor` tem sete parâmetros: core, max, keepAlive, unidade, fila, thread factory e rejection handler. O algoritmo:

1. Se `threads < core`, cria thread.
2. Se `threads >= core`, enfileira.
3. Se a fila está cheia e `threads < max`, cria thread.
4. Se fila cheia e `threads == max`, aplica a política de rejeição.

```java
var executor = new ThreadPoolExecutor(
    8, 16,
    60, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(500),
    new CustomThreadFactory("pedido-"),
    new ThreadPoolExecutor.CallerRunsPolicy()
);
executor.allowCoreThreadTimeOut(true);
```

Políticas: `AbortPolicy` (erro), `CallerRunsPolicy` (backpressure), `DiscardPolicy` (silencioso, perigoso) e `DiscardOldestPolicy`. Prefira falhar visivelmente.

Dimensionamento: para CPU, `núcleos` ou `núcleos + 1`. Para I/O, use a lei de Little: `threads ≈ throughput desejado × latência média`. Se 200 req/s × 0,2 s = 40 threads. Meça; não copie.

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    var futures = reqs.stream()
        .map(r -> executor.submit(() -> client.chamar(r)))
        .toList();
    for (var f : futures) f.get();
}
```

Virtual threads resolvem o custo de threads bloqueadas, mas não eliminam limites de conexão, CPU ou memória. Use um `Semaphore` para limitar chamadas a uma dependência.

## Na prática

Dê nome às threads: `pedido-0`, `pedido-1`. Sem isso, stack traces viram ruído. Exponha `activeCount`, `queueSize` e `completedTaskCount` como métricas. No Quarkus, configure `quarkus.thread-pool.core-threads`, `quarkus.thread-pool.max-threads` e `quarkus.thread-pool.queue-size` explicitamente.

Separe pools por tipo de trabalho: um para HTTP, um para e-mail, um para jobs pesados. Um pool compartilhado permite que um job lento mate o endpoint.

## Armadilhas comuns

- `newFixedThreadPool` com fila `LinkedBlockingQueue` sem limite.
- `maxPoolSize` ignorado porque a fila nunca enche.
- `ThreadLocal` sem `remove` em pool reutilizado: vazamento de memória e de contexto.
- Tarefas que capturam exceções e nunca logam.
- Shutdown sem `awaitTermination` e perda de trabalho.

## Checklist de domínio

- [ ] Sei explicar a ordem de decisão do `ThreadPoolExecutor`.
- [ ] Dimensiono pool por CPU ou por latência/throughput.
- [ ] Uso fila limitada e política de rejeição consciente.
- [ ] Tenho métricas de fila e threads ativas.
- [ ] Sei quando virtual threads ajudam e quando não ajudam.

## Para ir além

Leia o javadoc de `ThreadPoolExecutor` e o guia de virtual threads da Oracle. Depois simule uma fila ilimitada com carga e observe o heap.
