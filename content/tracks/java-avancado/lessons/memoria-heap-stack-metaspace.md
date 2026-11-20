> **Em uma frase:** o `-Xmx` limita apenas uma parte da memória do processo Java; entender heap, stack, metaspace, code cache e buffers nativos é o que separa um diagnóstico correto de um restart no escuro.

## O problema

O pod tem limite de 2 GB, a JVM roda com `-Xmx1g` e mesmo assim o Kubernetes mata o processo por OOM. Em outro caso, o heap dump tem 800 MB, mas o RSS do processo passa de 2,5 GB. Alguém sugere "aumentar o Xmx", o que só piora: o processo passa a ter menos espaço para metaspace, stacks e memória nativa.

A pergunta certa não é "quanto o heap usa?", mas "onde estão os outros consumidores e qual deles cresceu?". Cada região tem um limite, um sintoma de esgotamento e uma ferramenta diferente.

## Como funciona

O **heap** guarda objetos e arrays. É dividido em young generation (Eden e dois survivor spaces) e old generation, embora os coletores modernos organizem isso em regiões. A alocação jovem é barata: cada thread recebe um **TLAB** (Thread-Local Allocation Buffer), uma fatia do Eden. O caminho rápido é incrementar um ponteiro dentro do TLAB, sem lock. Quando o TLAB acaba, a thread pede outro ou cai no caminho lento, que pode disparar uma coleta.

```java
public class AllocationProbe {
    record Point(int x, int y) { }

    public static void main(String[] args) {
        long start = System.nanoTime();
        long sum = 0;
        for (int i = 0; i < 20_000_000; i++) {
            Point p = new Point(i, i);
            sum += p.x();
        }
        long ms = (System.nanoTime() - start) / 1_000_000;
        System.out.printf("sum=%d em %d ms%n", sum, ms);
    }
}
```

Esse loop pode alocar zero bytes: o C2 faz **escape analysis** e substitui o `Point` por escalares, porque ele não escapa do método. Rode com `-XX:-DoEscapeAnalysis` para ver a diferença de tempo e de pressão no GC. Isso não é garantia da linguagem; é uma otimização do JIT.

A **stack** é por thread, com frames de métodos, variáveis locais primitivas e referências. O padrão do HotSpot é cerca de 1 MB de espaço reservado por platform thread (`-Xss`), com commit sob demanda. Recursão profunda gera `StackOverflowError`, não `OutOfMemoryError`.

```java
public class StackProbe {
    private static int depth;

    private static void recurse() {
        depth++;
        recurse();
    }

    public static void main(String[] args) {
        try {
            recurse();
        } catch (StackOverflowError e) {
            System.out.println("profundidade=" + depth);
        }
    }
}
```

A **metaspace** guarda metadados de classes, métodos, constantes e bytecode. Fica fora do heap, em memória nativa, e por padrão cresce até esgotar o processo. Só é liberada quando o classloader e suas classes se tornam inalcançáveis. O **code cache** guarda código compilado pelo JIT (reserva padrão de 240 MB no HotSpot moderno). **Direct buffers** (`ByteBuffer.allocateDirect`) também vivem fora do heap e são limitados por `-XX:MaxDirectMemorySize`.

Um objeto comum tem 12 a 16 bytes de header e é alinhado a 8 bytes. Um `Integer` costuma ocupar 16 bytes; um `long` dentro de um objeto adiciona 8. Com compressed oops (heaps abaixo de ~32 GB), referências ocupam 4 bytes em vez de 8. Esses números variam com JVM e flags, mas explicam por que uma lista de milhões de `Integer` custa muito mais que um `int[]`.

## Na prática

Meça o que cada região está consumindo com ferramentas que não dependem de adivinhação:

```java
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryUsage;

public class MemoryReport {
    public static void main(String[] args) {
        MemoryMXBean memory = ManagementFactory.getMemoryMXBean();
        MemoryUsage heap = memory.getHeapMemoryUsage();
        MemoryUsage nonHeap = memory.getNonHeapMemoryUsage();
        System.out.printf("heap: init=%d MB used=%d MB max=%d MB%n",
                heap.getInit() / 1_000_000, heap.getUsed() / 1_000_000,
                heap.getMax() / 1_000_000);
        System.out.printf("non-heap: used=%d MB%n", nonHeap.getUsed() / 1_000_000);
        System.out.printf("threads=%d%n", Thread.activeCount());
    }
}
```

Em processo vivo, `jcmd <pid> GC.heap_info` mostra regiões e ocupação; `jcmd <pid> VM.metaspace` detalha a metaspace; `jcmd <pid> VM.native_memory summary` (com `-XX:NativeMemoryTracking=summary`) separa heap, code, GC, compiler, threads e memória de bibliotecas. Para um heap dump, `jcmd <pid> GC.heap_dump /tmp/heap.hprof`; analise com Eclipse MAT ou `jhsdb`.

Em container, prefira `-XX:MaxRAMPercentage=70` a um `-Xmx` fixo, deixando espaço para metaspace, code cache, stacks e buffers. O número de threads importa: 400 platform threads com stack de 1 MB reservam ~400 MB de espaço virtual, mesmo que o commit seja menor.

## Armadilhas comuns

- **Igualar `-Xmx` ao limite do container.** Não sobra memória para metaspace, stacks, code cache, buffers diretos e bibliotecas nativas. O processo é morto sem heap dump, porque o OOM é do sistema operacional, não da JVM.
- **Tratar `OutOfMemoryError: Metaspace` como vazamento de heap.** Procure classloaders retidos, geração dinâmica de classes (proxies, scripts) e `-XX:MaxMetaspaceSize` baixo demais.
- **Ignorar buffers diretos.** Netty, NIO e bibliotecas de gRPC alocam memória nativa; o sintoma é `OutOfMemoryError: Direct buffer memory` ou RSS alto com heap saudável.
- **Capturar `OutOfMemoryError` e continuar.** O processo está em estado indefinido; o correto é liberar recursos, registrar o heap dump e deixar o orquestrador reiniciar.
- **Chamar `System.gc()` para "limpar".** Além de caro, ele pode ser ignorado (`-XX:+DisableExplicitGC`) e não resolve retenção.
- **Esquecer `ThreadLocal` em pools.** O valor fica preso à thread e ao classloader, causando retenção de objetos e, em redeploys, de classes inteiras.

## Checklist de domínio

- [ ] Você separa heap, stack, metaspace, code cache e buffers diretos em um incidente
- [ ] Você explica por que TLAB torna a alocação jovem barata
- [ ] Você reconhece os três tipos de `OutOfMemoryError` e seus sinais
- [ ] Você usa `jcmd` para inspecionar memória sem reiniciar o processo
- [ ] Você dimensiona `-Xmx`/`MaxRAMPercentage` considerando o limite do container

## Para ir além

- [HotSpot — Memory Management](https://openjdk.org/groups/hotspot/docs/HotSpotGlossary.html)
- [Oracle — Java HotSpot VM Options](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html)
- [Baeldung — Java Memory Model e regiões de memória](https://www.baeldung.com/java-memory-management)
