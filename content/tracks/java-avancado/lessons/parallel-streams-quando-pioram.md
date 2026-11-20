> **Em uma frase:** parallel streams só ganham quando existe trabalho de CPU suficiente, uma fonte bem divisível e nenhum bloqueio — e perdem feio quando qualquer uma dessas condições falta.

## O problema

Um relatório demorava 1,2 s e alguém trocou `stream()` por `parallelStream()`. Na máquina do desenvolvedor caiu para 400 ms. Em produção, o p99 subiu e outros endpoints ficaram lentos, porque o relatório passou a ocupar o mesmo `ForkJoinPool.commonPool` usado pelo resto da aplicação. Em outro incidente, um pipeline paralelo que chamava uma API externa ficou mais lento que o sequencial: as threads do pool passaram o tempo bloqueadas em socket, não calculando.

Paralelismo não é um flag de performance. É uma decisão sobre tipo de trabalho, tamanho do problema e isolamento de recursos.

## Como funciona

`parallelStream()` executa sobre o `ForkJoinPool.commonPool`. O paralelismo padrão é `Runtime.getRuntime().availableProcessors() - 1` — em um container com 8 vCPUs, 7 threads — e pode ser alterado por `-Djava.util.concurrent.ForkJoinPool.common.parallelism=N`. O pool usa work-stealing: cada worker tem uma deque e, quando fica ocioso, rouba tarefas do fim da deque de outro.

A fonte precisa ser divisível. Um `ArrayList` e um array têm `Spliterator` que divide por índice, O(1), com blocos contíguos. Um `LinkedList` percorre nós para achar o meio; `Files.lines` e `BufferedReader.lines` têm tamanho desconhecido e divisão em lotes; `Stream.iterate` é essencialmente sequencial. A qualidade do `trySplit` decide se há paralelismo real ou apenas overhead.

| Fonte | Divisão | Observação |
|---|---|---|
| `int[]`, `ArrayList` | excelente | acesso indexado e contíguo |
| `HashSet`, `HashMap` | boa | divide por buckets |
| `LinkedList` | ruim | travessia para dividir |
| `Files.lines` | limitada | depende de lotes de linhas |

O ganho depende da relação entre trabalho e coordenação. A regra prática de Brian Goetz é o modelo **N × Q**: N elementos vezes Q trabalho por elemento precisa ser grande — dezenas de milhares de unidades — para dividir, agendar, roubar e combinar não dominarem. Somar um array de 10 mil `int` leva microssegundos; criar tarefas para 7 threads custa mais que a soma.

```java
import java.util.Arrays;

public class SpeedupIndicativo {
    // Trabalho de CPU artificial: 100 iterações por elemento
    static long trabalho(int valor) {
        long x = valor;
        for (int i = 0; i < 100; i++) {
            x = x * 31 + 17;
        }
        return x;
    }

    static long medir(int[] dados, boolean paralelo) {
        long inicio = System.nanoTime();
        var stream = Arrays.stream(dados);
        long total = (paralelo ? stream.parallel() : stream)
                .mapToLong(SpeedupIndicativo::trabalho)
                .sum();
        long ms = (System.nanoTime() - inicio) / 1_000_000;
        if (total == 42) System.out.print(""); // mantém o resultado vivo
        return ms;
    }

    public static void main(String[] args) {
        int[] dados = new int[5_000_000];
        Arrays.setAll(dados, i -> i);

        for (int i = 0; i < 5; i++) { medir(dados, false); medir(dados, true); } // aquecimento

        System.out.println("sequencial: " + medir(dados, false) + " ms");
        System.out.println("paralelo:   " + medir(dados, true) + " ms");
    }
}
```

Esse harness é um teste de fumaça, não um benchmark: sem JMH, o JIT, o GC e o sistema operacional contaminam o resultado. Ele serve para descobrir se há ganho de ordem de grandeza, não para decidir 5%.

## Na prática

O caso em que parallel streams brilham é CPU-bound, com fonte divisível, operação associativa e nenhum estado compartilhado: somar milhões de primitivos, aplicar uma transformação cara por elemento, processar imagens ou calcular agregações sobre arrays grandes. Reduções devem ser associativas; `sum`, `count` e `collect` com collectors bem implementados são. `forEach` com `ArrayList` compartilhado não é — a lista não é thread-safe e perde elementos.

O caso em que pioram é I/O. Chamar HTTP, banco ou disco dentro de um `parallelStream` bloqueia uma das poucas threads do common pool. O pool não cria threads de compensação, então a vazão fica limitada ao número de CPUs, não ao número de operações pendentes. Para I/O, use virtual threads: uma por tarefa, com o carrier liberado durante o bloqueio.

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class IoComVirtualThreads {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .build();
        List<String> urls = List.of("https://example.com", "https://example.org");

        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<Integer>> futuros = urls.stream()
                    .map(url -> executor.submit(() -> {
                        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                                .timeout(Duration.ofSeconds(3))
                                .GET()
                                .build();
                        return client.send(req, HttpResponse.BodyHandlers.discarding()).statusCode();
                    }))
                    .toList();

            for (Future<Integer> f : futuros) {
                System.out.println(f.get());
            }
        }
    }
}
```

O common pool é um recurso global. Um parallel stream pesado em um request pode retardar `CompletableFuture.supplyAsync` sem executor, outro parallel stream e qualquer biblioteca que use o mesmo pool. Dá para submeter o pipeline a um `ForkJoinPool` dedicado, mas isso não resolve I/O bloqueante e cria mais uma estrutura para dimensionar.

## Armadilhas comuns

- **Medir no laptop e concluir para produção.** Núcleos, CPU limits do container e memória mudam o resultado. Meça com a carga e o hardware reais.
- **`forEach` com coleção compartilhada.** Use `collect(Collectors.toList())` ou `toConcurrentMap` quando a ordem não importa.
- **`forEachOrdered` em pipeline paralelo.** Preserva a ordem, mas adiciona coordenação e pode eliminar o ganho.
- **`findFirst` em stream paralelo ordenado.** Precisa respeitar a ordem de encontro; `findAny` permite mais paralelismo.
- **`ThreadLocal` no common pool.** As threads são reutilizadas e o valor pode vazar entre tarefas. Contexto de segurança e transação não se propaga sozinho.
- **Achar que `parallel()` usa todas as CPUs.** O padrão é CPUs - 1, e o container pode expor menos CPUs do que o host.

## Checklist de domínio

- [ ] Você explica o modelo N × Q e estima quando o overhead domina
- [ ] Você identifica fontes com `Spliterator` ruim
- [ ] Você sabe por que I/O bloqueante não combina com o common pool
- [ ] Você mede speedup com aquecimento e comparação justa
- [ ] Você reconhece o risco de contaminar o pool compartilhado da aplicação

## Para ir além

- [Oracle — Parallelism](https://docs.oracle.com/javase/tutorial/collections/streams/parallelism.html)
- [Oracle — ForkJoinPool](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ForkJoinPool.html)
- [JEP 444 — Virtual Threads](https://openjdk.org/jeps/444)
