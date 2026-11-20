> **Em uma frase:** um benchmark caseiro mede o JIT, o GC e o cache do seu laptop; o JMH existe para impedir que você confunda esses artefatos com o custo do seu código.

## O problema

Você envolve um método em `System.nanoTime()`, roda 100 mil vezes e conclui que ele leva 0 ns. O JIT percebeu que o resultado não era usado e apagou o loop inteiro. Em outra tentativa, o primeiro lote é lento porque o código ainda está interpretado, e o segundo é rápido porque o C2 compilou; a "melhoria" de 10x é só ordem de execução. Pior: o benchmark roda no mesmo processo da IDE, com o heap cheio de objetos de outra execução, e o GC aparece no meio da medição.

Quase todo número de performance sem metodologia é ficção. JMH (Java Microbenchmark Harness) não deixa você ser inocente: ele cria uma JVM nova por fork, aquece o código, consome os resultados e reporta intervalo de confiança.

## Como funciona

Um benchmark JMH é uma classe com métodos anotados com `@Benchmark`. O gerador de anotações produz código que chama esses métodos em loop, dentro de iterações de tempo fixo. As configurações principais:

- `@Warmup(iterations, time)`: execuções descartadas para o JIT compilar e o heap estabilizar.
- `@Measurement(iterations, time)`: execuções que entram no resultado.
- `@Fork`: quantas JVMs novas executam o experimento. O padrão é 5; cada fork paga o custo de subir a JVM.
- `@BenchmarkMode`: `Throughput` (ops/s), `AverageTime` (tempo/op), `SampleTime` (distribuição e percentis) ou `SingleShotTime` (uma execução, para cold start).
- `@State`: o objeto que guarda os dados do benchmark. `Scope.Thread` isola por thread; `Scope.Benchmark` compartilha.

```java
import org.openjdk.jmh.annotations.*;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@Warmup(iterations = 5, time = 1)
@Measurement(iterations = 5, time = 1)
@Fork(1)
@State(Scope.Thread)
public class BuscaBenchmark {
    @Param({"1000"})
    int tamanho;

    private List<Integer> lista;
    private Set<Integer> conjunto;

    @Setup(Level.Trial)
    public void setup() {
        lista = new ArrayList<>(tamanho);
        conjunto = new HashSet<>(tamanho * 2);
        for (int i = 0; i < tamanho; i++) {
            lista.add(i);
            conjunto.add(i);
        }
    }

    @Benchmark
    public boolean buscaLinear() {
        return lista.contains(tamanho - 1); // O(n)
    }

    @Benchmark
    public boolean buscaHash() {
        return conjunto.contains(tamanho - 1); // O(1)
    }
}
```

Com 1.000 elementos, `buscaLinear` tende a custar centenas de nanossegundos e `buscaHash`, poucos. O número absoluto importa menos que a razão e a estabilidade; o JMH reporta algo como `412,3 ± 9,1 ns/op`, onde o intervalo é de 99,9% de confiança.

O `Blackhole` resolve o problema de resultados descartados. Um método `void` que calcula e joga fora pode ser eliminado; consumir o valor com `bh.consume(...)` torna o cálculo observável. Quando o método retorna um valor, o harness já o consome automaticamente.

```java
import org.openjdk.jmh.annotations.*;
import org.openjdk.jmh.infra.Blackhole;
import java.util.concurrent.TimeUnit;

@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@Warmup(iterations = 3, time = 1)
@Measurement(iterations = 5, time = 1)
@Fork(value = 2, jvmArgsAppend = {"-Xms512m", "-Xmx512m"})
@State(Scope.Thread)
public class BlackholeBenchmark {
    private int valor = 42;

    @Benchmark
    public double retornoConsumido() {
        return Math.log(valor); // o JMH consome o retorno
    }

    @Benchmark
    public void blackholeExplicito(Blackhole bh) {
        bh.consume(Math.log(valor)); // impede dead code elimination
    }
}
```

Constantes também enganam. `Math.log(42)` pode ser calculado em tempo de compilação e virar uma constante; por isso benchmarks sérios recebem entradas de `@Param` ou de estado mutável que o JIT não consegue dobrar. E o inverso acontece: loops pequenos podem ser desenrolados, então medir "uma chamada" dentro de um loop interno não mede uma chamada.

## Na prática

Rode fora da IDE, com o mesmo JDK e as mesmas flags de produção. Com Maven, o fluxo típico é empacotar o jar de benchmarks e executá-lo:

```bash
mvn -q clean package
java -jar target/benchmarks.jar BuscaBenchmark -f 2 -wi 5 -i 10 -prof gc
```

`-prof gc` mostra alocação por operação e tempo de GC. `-prof stack` ajuda a ver onde o tempo é gasto; `-prof perfasm` (Linux) mostra assembly, mas exige `perf` e não é para o dia a dia. O sufixo `-f 2` reduz forks durante a exploração; o resultado final deve usar mais forks e os mesmos parâmetros de produção.

Interprete com cuidado. `AverageTime` esconde a cauda: uma média de 2 ms com p99 de 80 ms é um problema para SLO. Use `Mode.SampleTime` e olhe p50, p99 e p99.9. Desconfie de diferenças menores que o erro reportado e de ganhos que só aparecem com `-Xmx` gigante. Rode em uma máquina ociosa, com o governor de CPU estável e, se possível, fixe o processo em núcleos (`taskset` no Linux). Em container, o CPU limit e o número de vCPUs mudam o resultado.

## Armadilhas comuns

- **Medir sem aquecimento.** A primeira execução paga interpretação, carregamento de classes e compilação. O JMH faz warmup por padrão; não use `-wi 0` para "economizar tempo".
- **Ignorar dead code elimination.** Se o resultado não é retornado nem consumido pelo `Blackhole`, o benchmark pode medir nada.
- **Usar `System.nanoTime()` dentro do loop.** O custo do relógio (dezenas de nanossegundos) contamina operações curtas. Deixe o JMH medir o lote.
- **Benchmark com estado compartilhado e mutável.** `Scope.Benchmark` com escrita concorrente mede contenção, não o algoritmo. Use `Scope.Thread` ou sincronize de propósito.
- **Poucos forks e uma única execução.** Uma JVM pode ter sorte de compilação ou sofrer com GC; forks repetem o experimento em processos limpos.
- **Comparar benchmarks de máquinas diferentes.** Frequência, cache, hyperthreading e vizinhança de container invalidam a comparação.

## Checklist de domínio

- [ ] Você explica o papel de warmup, fork e iteração de medição
- [ ] Você impede dead code elimination com retorno ou `Blackhole`
- [ ] Você evita constant folding usando `@Param` e estado
- [ ] Você lê `score ± error` e escolhe o modo adequado para latência
- [ ] Você roda o benchmark fora da IDE, com flags realistas e `-prof gc`

## Para ir além

- [OpenJDK — JMH](https://github.com/openjdk/jmh)
- [OpenJDK — JMH project](https://openjdk.org/projects/code-tools/jmh/)
- [Baeldung — Java Microbenchmark Harness](https://www.baeldung.com/java-microbenchmark-harness)
