> **Em uma frase:** uma platform thread é uma thread do sistema operacional com stack própria, e o custo real não está em criá-la, mas em quantas você mantém vivas e em quanto tempo elas passam paradas esperando.

## O problema

O pool tem 800 threads em 8 vCPUs. O p99 está em 2 s, a CPU em 35% e 700 threads aparecem como `RUNNABLE`. Parece CPU, mas quase todas estão paradas em `read()` de socket. Em outro incidente, o processo morre com `OutOfMemoryError: unable to create native thread` depois de três dias; a contagem subiu de 200 para 12 mil.

Os dois casos são sobre threads, por motivos opostos: excesso concorrendo por I/O e um vazamento que ninguém mediu. O profiler de CPU não ajuda — o custo está em memória, criação e troca de contexto.

## Como funciona

Uma **platform thread** mapeia 1:1 para uma thread do SO. A JVM reserva cerca de 1 MB para a stack (`-Xss`), com commit sob demanda e guard pages. Somando estruturas da JVM e do SO, 1000 threads reservam ~1 GB de espaço virtual, mesmo com commit menor — por isso "só mais 500 threads" pode falhar em container.

Criar uma thread custa dezenas de microssegundos: reservar stack, chamar `pthread_create`/`clone`, registrar no SO e na JVM. Para dez threads, irrelevante; para dez mil por segundo, o gargalo passa a ser a criação. **Trocar de contexto** custa poucos microssegundos: salvar registradores, trocar o stack pointer e, muitas vezes, perder cache L1/L2 e entradas de TLB. Cinquenta mil switches por segundo a 5 µs cada consomem 25% de um núcleo, sem contar o cache frio.

| Estado | Significado | Onde aparece |
|---|---|---|
| `RUNNABLE` | executando ou em syscall bloqueante | socket read, arquivo |
| `BLOCKED` | esperando entrar em monitor | `synchronized` |
| `WAITING` | espera indefinida | `wait`, `join`, `park` |
| `TIMED_WAITING` | espera com prazo | `sleep`, `tryLock` |

Duas leituras enganam em `jstack`. Uma thread parada em `socketRead0` aparece `RUNNABLE`, porque a JVM não sabe que o kernel a suspendeu. Já uma thread esperando `ReentrantLock` aparece `WAITING` (park), não `BLOCKED` — `BLOCKED` é exclusivo de monitor `synchronized`. Tratar "RUNNABLE = CPU" como regra leva a diagnóstico errado.

```java
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.locks.LockSupport;

public class ThreadStates {
    private static final Object A = new Object();
    private static final Object B = new Object();

    public static void main(String[] args) throws Exception {
        CountDownLatch dentro = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);

        Thread donaDoMonitor = Thread.ofPlatform().name("dona-monitor").start(() -> {
            synchronized (A) {
                dentro.countDown();
                try { soltar.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
        });
        dentro.await();

        Thread bloqueada = Thread.ofPlatform().name("bloqueada").start(() -> {
            synchronized (A) { } // BLOCKED enquanto dona-monitor segura A
        });

        Thread emWait = Thread.ofPlatform().name("em-wait").start(() -> {
            synchronized (B) {
                try { B.wait(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
        });

        Thread dormindo = Thread.ofPlatform().name("dormindo").start(() -> {
            try { Thread.sleep(10_000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        });

        Thread parkeada = Thread.ofPlatform().name("parkeada").start(LockSupport::park);

        Thread.sleep(300); // dá tempo de os estados se estabilizarem
        for (Thread t : new Thread[]{donaDoMonitor, bloqueada, emWait, dormindo, parkeada}) {
            System.out.printf("%-14s %s%n", t.getName(), t.getState());
        }

        soltar.countDown();
        synchronized (B) { B.notifyAll(); }
        dormindo.interrupt();
        parkeada.interrupt();
    }
}
```

## Na prática

Nomeie threads antes de precisar. `Thread.ofPlatform().name("checkout-", 0).factory()` produz `checkout-0`, `checkout-1` e transforma um dump de 400 linhas em informação utilizável. Combine com `UncaughtExceptionHandler`: exceção que mata a thread sem log é incidente invisível.

```java
import java.lang.management.ManagementFactory;
import java.lang.management.ThreadInfo;
import java.lang.management.ThreadMXBean;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

public class ThreadAudit {
    public static void main(String[] args) throws Exception {
        ThreadMXBean mx = ManagementFactory.getThreadMXBean();
        System.out.printf("vivas=%d pico=%d%n", mx.getThreadCount(), mx.getPeakThreadCount());

        Map<String, Long> porPrefixo = Arrays.stream(mx.dumpAllThreads(false, false))
                .map(ThreadInfo::getThreadName)
                .collect(Collectors.groupingBy(ThreadAudit::prefixo, Collectors.counting()));
        porPrefixo.forEach((p, n) -> System.out.printf("%-18s %d%n", p, n));

        AtomicInteger seq = new AtomicInteger();
        ThreadFactory fabrica = r -> Thread.ofPlatform()
                .name("order-worker-" + seq.incrementAndGet())
                .uncaughtExceptionHandler((t, e) -> System.err.println("falha em " + t.getName() + ": " + e))
                .unstarted(r);

        try (var pool = Executors.newFixedThreadPool(4, fabrica)) {
            for (int i = 0; i < 8; i++) {
                pool.submit(() -> System.out.println(Thread.currentThread().getName()));
            }
        }
    }

    private static String prefixo(String nome) {
        int hifen = nome.lastIndexOf('-');
        return hifen > 0 ? nome.substring(0, hifen) : nome;
    }
}
```

Trate a contagem como SLI: alerte quando crescer sem acompanhar o tráfego. Para saber quem cria, filtre `jdk.ThreadStart` no JFR; para o estado atual, `jcmd <pid> Thread.print`. Se sobe em degraus a cada deploy, procure pool recriado ou thread criada em construtor de bean.

Para dimensionar, use Little's law em vez de copiar 200: `threads = núcleos × utilização × (1 + espera/serviço)`. Com 8 núcleos, 70% de utilização e razão espera/serviço de 4, dá 28 threads. Meça a razão com JFR (`jdk.ThreadPark` e `jdk.SocketRead`); o número vem da carga, não do hábito. Para medir troca de contexto, `pidstat -w -p <pid> 1` ou a coluna `cs` do `vmstat 1`.

## Armadilhas comuns

- **Ler `RUNNABLE` como "usando CPU".** Muitas threads em `RUNNABLE` podem estar em syscalls; confirme com `pidstat`, JFR ou `top -H`.
- **Criar uma thread por requisição sem limite.** É thread leak esperando tráfego; use pool com fila bounded ou virtual threads.
- **Engolir `InterruptedException`.** Um `catch` vazio remove o cancelamento; restaure o flag com `Thread.currentThread().interrupt()`.
- **Usar `Thread.stop`, `suspend` ou `resume`.** Foram removidos/descontinuados por deixarem estado inconsistente; use interrupção cooperativa.
- **Deixar threads sem nome.** Sem `checkout-7`, o dump vira `pool-3-thread-17` e você perde minutos correlacionando.

## Checklist de domínio

- [ ] Você explica os seis estados e o que cada um revela em um dump
- [ ] Você distingue thread bloqueada em syscall de thread queimando CPU
- [ ] Você calcula o custo de stack e de context switch para um pool
- [ ] Você dimensiona threads com Little's law e mede a razão espera/serviço
- [ ] Você detecta thread leak por métrica, JFR e `jcmd`

## Para ir além

- [Java 21 — `Thread` API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Thread.html)
- [Java 21 — `Thread.State`](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Thread.State.html)
- [Baeldung — Life Cycle of a Thread in Java](https://www.baeldung.com/java-thread-lifecycle)
