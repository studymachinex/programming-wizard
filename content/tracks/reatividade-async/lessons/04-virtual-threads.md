> **Em uma frase:** virtual threads tornam o bloqueio barato em memória, mas não grátis: a carrier ainda é finita, o pinning ainda trava o escalonador e o código continua precisando de limite, timeout e cancelamento.

A promessa é sedutora: escreva código bloqueante simples e tenha a escalabilidade de um modelo reativo. Isso funciona para I/O, desde que você entenda o que acontece por baixo — e desde que não confunda “barato” com “ilimitado”.

## O problema

Um serviço precisa atender 5.000 requisições simultâneas, cada uma fazendo duas consultas JDBC e uma chamada HTTP. Com threads de plataforma e um pool de 200, as outras 4.800 esperam na fila; aumentar o pool para 5.000 custa gigabytes de stack e piora a troca de contexto. O tempo de resposta explode mesmo com o banco longe de saturar.

Outro time adota virtual threads, mas mantém um `synchronized` em volta da chamada JDBC. Sob carga, a vazão não melhora e o log mostra threads fixadas na carrier. O problema não era o tipo de thread; era o que o código fazia enquanto bloqueava.

## Como funciona

Uma virtual thread é uma tarefa gerenciada pela JVM, não uma thread do sistema operacional. Ela executa em uma **carrier thread** — uma thread de plataforma do `ForkJoinPool` — e, quando encontra uma operação bloqueante que sabe desmontar (socket, `sleep`, fila, chamada HTTP), ela libera a carrier e volta depois. Esse é o **mounting/unmounting**. A carrier atende muitas virtuais ao longo do tempo.

O ganho é de throughput em I/O: milhares de tarefas bloqueadas custam poucos KB cada, em vez de 1 MB de stack. Não há ganho de CPU; para cálculo puro, virtual threads apenas adicionam overhead. E a carrier pool continua tendo o tamanho dos núcleos, então uma tarefa que não desmonta pode esgotá-la.

```java
Thread.ofVirtual()
    .name("pedido-", 0)
    .start(() -> processar(pedido));
```

O caso clássico de **pinning** no Java 21–23 é bloquear dentro de `synchronized` ou em uma chamada JNI: a virtual thread não consegue desmontar e prende a carrier. Troque o monitor por `ReentrantLock` em trechos com I/O. Para diagnosticar, rode com `-Djdk.tracePinnedThreads=full`; o Java 24 (JEP 491) removeu o pinning por `synchronized`, mas o problema com JNI e código nativo permanece.

Para fan-out de I/O, o executor por tarefa é o padrão. Não faça pool de virtual threads: crie uma por tarefa e limite o recurso externo com um `Semaphore`.

```java
import java.util.concurrent.Executors;

public Resumo carregar(long id) throws Exception {
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
        var cliente = executor.submit(() -> clienteClient.buscar(id));
        var pedido = executor.submit(() -> pedidoClient.buscar(id));
        var saldo = executor.submit(() -> fidelidade.saldo(id));

        // get() bloqueia, mas com virtual threads isso é barato.
        return new Resumo(cliente.get(), pedido.get(), saldo.get());
    }
}
```

O `try-with-resources` fecha o executor e espera as tarefas terminarem. O problema é que uma falha em uma tarefa não cancela as outras: o `get` da primeira exceção sai, mas as demais continuam rodando. Structured concurrency resolve exatamente isso.

No Java 21, `StructuredTaskScope` é preview e exige `--enable-preview --release 21`. O escopo define o ciclo de vida das tarefas filhas: o pai só sai depois de `join`, e `ShutdownOnFailure` cancela as irmãs quando uma falha.

```java
import java.util.concurrent.StructuredTaskScope;
import java.util.concurrent.StructuredTaskScope.Subtask;

public Resumo carregarEstruturado(long id) throws Exception {
    try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
        Subtask<Cliente> cliente = scope.fork(() -> clienteClient.buscar(id));
        Subtask<Pedido> pedido = scope.fork(() -> pedidoClient.buscar(id));

        scope.join();          // espera todas
        scope.throwIfFailed(); // propaga a primeira falha

        return new Resumo(cliente.get(), pedido.get());
    }
}
```

`ShutdownOnSuccess` faz o oposto: a primeira tarefa que termina com sucesso cancela as demais, útil para hedge entre réplicas. A API foi finalizada no Java 25 (JEP 506); no Java 21, trate como preview e não a espalhe por toda a base sem política de upgrade.

| Modelo | Bloqueio em I/O | Custo por tarefa | Limite prático | Melhor uso |
|---|---|---|---|---|
| Plataforma em pool | Ocupa a thread | Stack ~1 MB | Tamanho do pool | Carga moderada e previsível |
| Virtual thread | Desmonta da carrier | Alguns KB | Conexões e memória | Muitas tarefas de I/O |
| Event loop | Proibido | Muito baixo | Núcleos | Muitas conexões não bloqueantes |
| Structured scope | Herda o modelo | O das filhas | Dependências externas | Fan-out com ciclo de vida claro |

## Na prática

Em Quarkus, `@RunOnVirtualThread` executa o método em uma virtual thread por requisição. O método precisa ser bloqueante e retornar um tipo direto; não combine com `Uni`/`Multi`, porque aí o modelo já é não bloqueante. A anotação é uma opção de execução, não uma licença para ignorar limites.

Limite o recurso que está atrás da virtual thread. Um banco com 100 conexões não aguenta 5.000 consultas simultâneas só porque cada uma tem uma virtual thread:

```java
private static final Semaphore CONEXOES = new Semaphore(100);

String buscar(long id) throws InterruptedException {
    CONEXOES.acquire();
    try {
        return jdbcClient.buscar(id); // bloqueia, mas libera a carrier
    } finally {
        CONEXOES.release();
    }
}
```

Meça carrier threads, tarefas montadas, tempo de pinning e fila do pool. Nomeie as virtual threads (`pedido-0`) para que o `jstack` e o tracing façam sentido. Evite `ThreadLocal` com objetos grandes: cada virtual thread tem o seu, e milhões delas multiplicam o heap. Prefira contexto explícito ou scoped values.

## Armadilhas comuns

- Fazer pool de virtual threads e recriar a fila que elas deveriam eliminar.
- Manter `synchronized` em volta de I/O e sofrer pinning silencioso.
- Achar que virtual threads dispensam timeout, semáforo e limite de conexões.
- Usar virtual threads para processamento CPU-bound esperando ganho de velocidade.
- Guardar cache por `ThreadLocal` em milhões de threads.
- Esquecer de fechar o executor ou o escopo e vazar tarefas.
- Anotar com `@RunOnVirtualThread` um método que retorna `Uni` e achar que o Quarkus vai “resolver”.

## Checklist de domínio

- [ ] Explico mounting, unmounting e carrier threads sem recorrer a analogias vagas.
- [ ] Sei reconhecer e corrigir pinning por `synchronized` e JNI.
- [ ] Uso `Executors.newVirtualThreadPerTaskExecutor()` sem fazer pool.
- [ ] Limito conexões e memória mesmo com virtual threads.
- [ ] Sei quando structured concurrency substitui um `allOf` manual.
- [ ] Distingo virtual threads de event loop pelo tipo de bloqueio.

## Para ir além

Leia o JEP 444 e o guia de virtual threads do Quarkus. Depois rode a mesma carga com pool de plataforma e com virtual threads, meça throughput e memória, e ative `-Djdk.tracePinnedThreads=full` para encontrar o trecho que ainda prende a carrier.

- [Java 21 — StructuredTaskScope](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/StructuredTaskScope.html)
- [Quarkus — virtual threads](https://quarkus.io/guides/virtual-threads)
- [OpenJDK — JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [OpenJDK — JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491)
