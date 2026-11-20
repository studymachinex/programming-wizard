> **Em uma frase:** virtual threads tornam bloqueio barato, mas não tornam CPU, conexões e memória infinitas — e é aí que a maioria dos bugs de produção aparece.

Threads de plataforma custam ~1 MB de stack e uma troca de contexto caro. Virtual threads são agendadas pela JVM, crescem sob demanda e devolvem a thread portadora quando bloqueiam em I/O. O resultado é código sequencial simples com escalabilidade de assíncrono.

## O problema

Um serviço precisa chamar 50 dependências por request. Com pool de 200 threads, o throughput máximo é 200 chamadas simultâneas; o resto espera. Com virtual threads, você pode ter milhares de operações em voo — mas o banco continua com 100 conexões e a CPU com 8 núcleos. Sem limite, você troca um gargalo por outro.

## Como funciona

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    var futuros = ids.stream()
        .map(id -> executor.submit(() -> cliente.buscar(id)))
        .toList();
    for (var f : futuros) processar(f.get());
}
```

Cada tarefa ganha uma virtual thread. Quando `cliente.buscar` bloqueia em socket, a thread é desmontada da portadora; outra tarefa roda. Não é mágica: operações CPU-bound continuam ocupando a portadora.

**Pinning:** uma virtual thread fica presa à portadora em `synchronized` (antes do Java 24) e em chamadas nativas. Se muitas ficam pinadas, a escalabilidade some. Prefira `ReentrantLock` em código novo e evite bloquear dentro de `synchronized`.

**Structured concurrency (Java 21 preview):** `StructuredTaskScope` garante que subtarefas terminem juntas, com cancelamento e propagação de erro.

```java
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    var cliente = scope.fork(() -> clienteClient.buscar(id));
    var pedido  = scope.fork(() -> pedidoClient.buscar(id));
    scope.join().throwIfFailed();
    return new Resumo(cliente.get(), pedido.get());
}
```

Se uma falha, a outra é cancelada. O bloco só termina quando ambas terminam — sem threads órfãs.

## Na prática

Adote virtual threads para I/O bloqueante: HTTP, JDBC, filas. Mantenha pool limitado para recursos escassos (conexões de banco) com `Semaphore` ou HikariCP. Não use `ThreadLocal` pesado sem necessidade; milhões de threads multiplicam o custo.

Meça com JFR (`jdk.VirtualThreadPinned`, `jdk.VirtualThreadSubmitFailed`) e com métricas de duração. Teste com latência realista: um mock instantâneo esconde o problema.

## Armadilhas comuns

- Achar que virtual threads substituem backpressure.
- `synchronized` em volta de chamada HTTP: pinning em massa.
- Pool de conexões pequeno e milhares de virtuais: fila no banco.
- `Thread.sleep` dentro de CPU-bound: não libera CPU.
- Usar API preview sem `--enable-preview` e sem plano de upgrade.

## Checklist de domínio

- [ ] Sei explicar montagem/desmontagem e pinning.
- [ ] Limito recursos escassos separadamente.
- [ ] Uso `StructuredTaskScope` para tarefas relacionadas.
- [ ] Meço pinning e falhas de submissão.
- [ ] Sei quando threads de plataforma ainda são melhores.

## Para ir além

Leia o JEP 444 (virtual threads) e o JEP 453 (structured concurrency). Depois rode uma carga de I/O com 10 mil tarefas e compare com um pool fixo.
