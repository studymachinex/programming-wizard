> **Em uma frase:** o JIT compila o que é executado com frequência e apaga o que não tem efeito observável; entender esse contrato é o que impede você de medir fumaça e de otimizar código que já não existe.

## O problema

Você escreve um microbenchmark com `System.nanoTime()`, roda o método um milhão de vezes e conclui que ele custa 0,4 ns — ou zero. Em produção, o mesmo trecho consome 8% da CPU. Em outro, um deploy "sem mudança relevante" derruba o throughput em 20% e o log não mostra nada.

As duas situações têm a mesma raiz: o código que roda não é o que você escreveu. Ele foi interpretado, perfilado, compilado, inlined e talvez desotimizado; sem enxergar isso, você otimiza o que já foi removido.

## Como funciona

HotSpot usa **compilação em camadas**. Tudo começa no interpretador (nível 0). Métodos com centenas a milhares de execuções sobem para o C1 (níveis 1–3), que compila rápido e, no nível 3, coleta perfil de tipos e branches. Com mais calor, o C2 (nível 4) recompila com otimizações agressivas. Loops longos podem ser compilados por **OSR** (on-stack replacement) com o método ainda na pilha; em `-XX:+PrintCompilation`, aparece com `%`.

A otimização que habilita as outras é o **inlining**. O C2 só otimiza o que enxerga; um getter inlined permite constant folding, eliminação de null check e escape analysis. Os limites padrão são `-XX:MaxInlineSize=35` (bytes de bytecode para métodos frios) e `-XX:FreqInlineSize=325` (métodos quentes). Com dois receptores distintos o call site fica bimórfico; com três ou mais, megamórfico, e o dispatch volta a ser virtual — por isso uma interface com muitas implementações pode custar mais que um `if`.

Compilação especulativa depende de suposições. Quando uma classe nova é carregada ou um branch nunca tomado é tomado, o C2 cai em um **uncommon trap** e desotimiza o método: `-XX:+PrintCompilation` mostra `made not entrant`. O código volta ao interpretador e é recompilado com o novo perfil.

**Escape analysis** responde: este objeto sai do método? Se não sai, o C2 pode fazer **scalar replacement** (trocar o objeto por variáveis locais, eliminando a alocação) e **lock elision** (remover um monitor cujo objeto ninguém mais vê). O `record` abaixo não escapa e tende a custar zero alocação; a lista força escape e o objeto passa a existir no heap.

```java
import java.util.ArrayList;
import java.util.List;

public class EscapeProbe {
    record Item(long id, long value) { }

    private static volatile long sink;

    public static void main(String[] args) {
        long soma = 0;
        for (int i = 0; i < 20_000_000; i++) {
            Item item = new Item(i, i * 2L); // não escapa: candidato a scalar replacement
            soma += item.value();
        }
        sink = soma;

        List<Item> retidos = new ArrayList<>();
        for (int i = 0; i < 1_000_000; i++) {
            retidos.add(new Item(i, i * 2L)); // escapa: alocação real
        }
        System.out.println("retidos=" + retidos.size() + " soma=" + sink);
    }
}
```

Rode com `-Xlog:gc` e depois com `-XX:-DoEscapeAnalysis`: a pressão de GC muda no primeiro loop, não no segundo. Se o ganho não aparecer, o método não foi inlined ou o objeto escapou.

## Na prática

Escolha a ferramenta pela pergunta. "O método foi compilado?" → `-XX:+PrintCompilation` ou `jcmd <pid> Compiler.queue`. "O code cache encheu?" → `jcmd <pid> Compiler.codecache`. "Onde queima CPU?" → JFR ou async-profiler. "Quem retém memória?" → heap dump com dominator tree. Heap dump para CPU é o erro mais comum de quem começa.

```java
import java.lang.management.CompilationMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryUsage;

public class CodeCacheWatch {
    public static void main(String[] args) throws Exception {
        CompilationMXBean jit = ManagementFactory.getCompilationMXBean();
        long jitAntes = jit.getTotalCompilationTime();
        long inicio = System.nanoTime();

        Thread.sleep(10_000); // janela de observação

        long jitDepois = jit.getTotalCompilationTime();
        double segundos = (System.nanoTime() - inicio) / 1e9;
        System.out.printf("compilação: %d ms em %.1f s (%.1f%% de uma CPU)%n",
                jitDepois - jitAntes, segundos, (jitDepois - jitAntes) / (segundos * 10));

        for (MemoryPoolMXBean pool : ManagementFactory.getMemoryPoolMXBeans()) {
            if (pool.getName().startsWith("CodeHeap")) {
                MemoryUsage u = pool.getUsage();
                System.out.printf("%-24s %d/%d KB (%.1f%%)%n",
                        pool.getName(), u.getUsed() / 1024, u.getMax() / 1024,
                        100.0 * u.getUsed() / u.getMax());
            }
        }
    }
}
```

O code cache reserva 240 MB por padrão no HotSpot 64-bit. Se enche, a JVM para de compilar e o código volta ao interpretador — queda silenciosa de throughput, sem exceção. Monitore a ocupação e ajuste `-XX:ReservedCodeCacheSize`.

Em produção, ligue JFR com overhead baixo: `-XX:StartFlightRecording=filename=app.jfr,duration=10m,settings=profile`. Depois, `jfr print --events jdk.Compilation,jdk.Deoptimization app.jfr` mostra o que foi compilado e desotimizado. Para CPU, `asprof -d 30 -e cpu <pid>` gera um flame graph; a largura é tempo, e a folha larga é onde o tempo está. Nenhuma ferramenta substitui carga realista: 30 segundos de tráfego sintético podem eleger um método que não aparece no pico.

## Armadilhas comuns

- **Microbenchmark sem consumir o resultado.** O JIT elimina código morto e dobra constantes; sem um `sink` ou o `Blackhole` do JMH, você mede zero.
- **Medir a primeira execução.** Nas primeiras milhares de chamadas o código está no interpretador ou no C1; o número não representa o regime estável.
- **Usar `-Xint` como prova.** Isso desliga o JIT e mede o pior caso, não o ganho real.
- **Achar que escape analysis é garantia.** Depende de inlining, de compilação pelo C2 e de o objeto realmente não escapar; nunca projete a latência contando com ela.
- **Confundir `made not entrant` com bug.** Desotimização é o mecanismo normal de corrigir uma especulação; o bug está na suposição que mudou.

## Checklist de domínio

- [ ] Você explica os níveis 0–4 e o papel do perfil no C1
- [ ] Você reconhece inlining, OSR e desotimização em `-XX:+PrintCompilation`
- [ ] Você demonstra scalar replacement e lock elision com e sem `DoEscapeAnalysis`
- [ ] Você escolhe entre JFR, async-profiler e heap dump pela pergunta
- [ ] Você detecta code cache cheio e queda silenciosa de throughput

## Para ir além

- [Oracle — Java HotSpot VM Options](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html)
- [OpenJDK — HotSpot Glossary of Terms](https://openjdk.org/groups/hotspot/docs/HotSpotGlossary.html)
- [async-profiler — documentação](https://github.com/async-profiler/async-profiler)
- [JMH — Java Microbenchmark Harness](https://github.com/openjdk/jmh)
