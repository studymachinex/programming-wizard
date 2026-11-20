> **Em uma frase:** G1, ZGC e Shenandoah resolvem o mesmo problema — coletar lixo sem congelar a aplicação — com estratégias diferentes, e escolher entre eles é decidir qual preço você paga em throughput, CPU ou memória.

## O problema

Sua API roda com `-Xmx8g` e G1. O p99 fica em 120 ms, mas a cada dois minutos aparece um pico de 1,2 s e o log registra `Pause Full (G1 Compaction Pause)`. Alguém sugere ZGC porque "tem pausa de menos de 1 ms"; outro diz que ZGC "come CPU". Sem modelo do que cada coletor faz, a decisão vira aposta.

A pergunta útil não é "qual é o melhor GC", mas "qual minha meta de pausa, o tamanho do heap, quanto throughput posso perder e o que o log mostra quando a meta é violada".

## Como funciona

O G1, padrão desde o JDK 9, fatia o heap em regiões de 1 a 32 MB, mirando cerca de 2048 regiões. Cada uma é Eden, Survivor, Old ou livre. A coleta jovem é stop-the-world e evacua objetos vivos; a mista inclui regiões Old com melhor retorno. O conjunto coletado é dimensionado para caber em `-XX:MaxGCPauseMillis` (padrão 200 ms), meta de melhor esforço, não garantia.

Para coletar uma região Old sem varrer o heap inteiro, o G1 mantém **remembered sets**: quem aponta para quem. Objetos maiores que 50% de uma região são **humongous**, ocupam regiões inteiras, saem do caminho rápido do TLAB e podem disparar coletas em sequência.

```java
import java.util.ArrayList;
import java.util.List;

public class HumongousProbe {
    public static void main(String[] args) {
        // Rode com: -Xmx1g -Xlog:gc+heap=info
        // A linha "Heap Region Size" mostra o tamanho da região (1 MB aqui).
        List<byte[]> retidos = new ArrayList<>();
        for (int i = 0; i < 64; i++) {
            // 600 KB > 50% de uma região de 1 MB: cada array vira humongous
            retidos.add(new byte[600 * 1024]);
        }
        Runtime rt = Runtime.getRuntime();
        System.out.printf("arrays=%d heap usado=%d MB de %d MB%n",
                retidos.size(),
                (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024),
                rt.maxMemory() / (1024 * 1024));
    }
}
```

ZGC e Shenandoah movem e compactam objetos **concorrentemente**, com a aplicação rodando. O ZGC usa ponteiros coloridos — bits de estado no próprio ponteiro — e load barriers para corrigir referências durante a realocação. As pausas ficam abaixo de 1 ms e não crescem com o heap; o preço é cada leitura passar pela barreira, memória extra para forwarding e CPU. No Java 21, o ZGC geracional é opt-in com `-XX:+ZGenerational`; sem a flag, o heap inteiro é uma geração só, o que favorece pausa e penaliza objetos de vida curta.

O Shenandoah usa Brooks pointers e load reference barriers, com pausas na casa de 10 ms. Vem nos builds OpenJDK, não no JDK da Oracle: confirme com `java -XX:+PrintFlagsFinal -version`.

| Situação | Coletor | Preço |
|---|---|---|
| Heap até ~8 GB, pausa de 100–200 ms serve | G1 | tuning de regiões e leitura de log |
| Pausa abaixo de 10 ms com heap grande | ZGC ou Shenandoah | CPU, barreiras e memória extra |

Jobs batch ficam melhor no Parallel GC: sem barreiras, pausas longas em troca de throughput.

## Na prática

Ligue o log antes de discutir coletor: `-Xlog:gc*,gc+heap=info:file=gc.log:time,uptime,level,tags`. Ele responde três perguntas: pausa p99, tempo em GC e ocupação do heap **depois** da coleta. Se o heap pós-coleta sobe a cada ciclo, existe retenção; nenhum coletor conserta vazamento.

```java
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class GcPauseReport {
    // Linha do unified logging:
    // [2026-05-01T10:00:00.123+0000][123.456s][info][gc] GC(42) Pause Young (Normal) ... 512M->128M(2048M) 12.345ms
    private static final Pattern PAUSA = Pattern.compile("Pause .*?([\\d.]+)ms\\s*$");

    public static void main(String[] args) throws Exception {
        List<Double> pausas = new ArrayList<>();
        for (String linha : Files.readAllLines(Path.of(args[0]))) {
            Matcher m = PAUSA.matcher(linha);
            if (m.find()) {
                pausas.add(Double.parseDouble(m.group(1)));
            }
        }
        if (pausas.isEmpty()) {
            System.out.println("nenhuma pausa encontrada");
            return;
        }
        Collections.sort(pausas);
        double total = pausas.stream().mapToDouble(Double::doubleValue).sum();
        System.out.printf("pausas=%d total=%.0f ms p50=%.1f p99=%.1f max=%.1f%n",
                pausas.size(), total,
                percentil(pausas, 0.50), percentil(pausas, 0.99),
                pausas.get(pausas.size() - 1));
    }

    private static double percentil(List<Double> ordenada, double p) {
        int idx = (int) Math.ceil(p * ordenada.size()) - 1;
        return ordenada.get(Math.max(0, idx));
    }
}
```

Se o p99 está bom e o máximo é um Full GC isolado, você tem um evento, não um regime. Se o máximo se repete, procure humongous, IHOP (`-XX:InitiatingHeapOccupancyPercent`, padrão 45) e taxa de promoção. `-XX:G1HeapRegionSize=4m` reduz humongous, mas engorda a granularidade. Baixar `MaxGCPauseMillis` para 10 ms costuma gerar coletas pequenas, marking atrasado e Full GC.

Para ZGC, reserve folga de heap e meça throughput com carga real; para G1, acompanhe `jcmd <pid> GC.heap_info` ao longo de dias.

## Armadilhas comuns

- **Tratar `MaxGCPauseMillis` como SLA.** É uma meta que orienta o tamanho do collection set; humongous e Full GC estouram o valor.
- **Apertar a meta de pausa no G1.** Meta agressiva gera coletas pequenas e frequentes, marking atrasado e Full GC.
- **Ignorar objetos humongous.** Buffers grandes e arrays de exportação acima de metade da região fragmentam o heap e disparam coletas.
- **Dimensionar heap pelo pico histórico.** Heap grande demais aumenta o custo de marking e de um eventual Full GC; meça a ocupação pós-coleta.
- **Trocar de coletor sem baseline.** ZGC e Shenandoah cobram throughput e CPU; sem medir, você troca pausa por regressão.

## Checklist de domínio

- [ ] Você explica regiões, remembered sets e objetos humongous no G1
- [ ] Você lê um log e separa pausa young, mista e Full GC
- [ ] Você calcula o overhead de GC e a taxa de alocação a partir do log
- [ ] Você escolhe coletor a partir de meta de pausa, heap e throughput
- [ ] Você diagnostica Full GC recorrente por IHOP, humongous ou vazamento

## Para ir além

- [Oracle — HotSpot Virtual Machine Garbage Collection Tuning Guide](https://docs.oracle.com/en/java/javase/21/gctuning/)
- [JEP 439 — Generational ZGC](https://openjdk.org/jeps/439)
- [JEP 189 — Shenandoah: A Low-Pause-Time Garbage Collector](https://openjdk.org/jeps/189)
