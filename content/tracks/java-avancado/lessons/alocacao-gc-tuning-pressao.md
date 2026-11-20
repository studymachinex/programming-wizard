> **Em uma frase:** o GC não é lento por natureza; ele fica caro quando a taxa de alocação enche o Eden rápido demais, promove objetos cedo e transforma memória descartável em trabalho de cópia.

## O problema

O pod tem 2 GB, a JVM roda com `-Xmx1g` e o CPU vive em 35% sem tráfego excepcional. O p99 tem picos de 300 ms a cada poucos segundos, e o log mostra coletas young a cada 200 ms. O time aumenta o heap para 2 GB; as pausas ficam mais raras, mas mais longas, e o problema volta quando o tráfego dobra.

A pergunta certa é: quantos MB por segundo essa aplicação aloca, quanto disso sobrevive ao young GC e por que? Sem esses números, "ajustar o GC" é chutar flags.

## Como funciona

O heap jovem é dividido em Eden e dois survivor spaces (S0 e S1). Objetos nascem no Eden, dentro do TLAB de cada thread. Quando o Eden enche, ocorre uma **young collection**: objetos vivos são copiados para um survivor ou promovidos ao old generation; o resto é descartado de uma vez. A cada coleta, os survivors alternam entre S0 e S1, e o contador de idade aumenta. Ao atingir o **tenuring threshold**, o objeto é promovido.

No G1, o heap é dividido em regiões de 1 a 32 MB (tipicamente 2048 regiões, com tamanho derivado do heap). Objetos maiores que metade de uma região são **humongous** e ocupam regiões inteiras, o que fragmenta e custa caro. Uma taxa alta de alocação significa Eden enchendo várias vezes por segundo; se os objetos morrem cedo, o custo é só cópia. Se sobrevivem, o custo sobe: promoção, old gen e eventual mixed GC.

A conta é simples. Se o Eden efetivo tem 512 MB e enche a cada 200 ms, a taxa é 512 MB / 0,2 s = 2,5 GB/s. Com pausa média de 15 ms a cada 200 ms, o GC consome 7,5% do tempo de CPU — e cada pausa é latência que o usuário sente.

```java
import com.sun.management.ThreadMXBean;
import java.lang.management.ManagementFactory;
import java.util.ArrayList;
import java.util.List;

public class TaxaAlocacao {
    record Pedido(long id, String cliente, int itens) { }

    public static void main(String[] args) {
        ThreadMXBean bean = (ThreadMXBean) ManagementFactory.getThreadMXBean();
        long tid = Thread.currentThread().threadId();
        int n = 200_000;

        long antes = bean.getThreadAllocatedBytes(tid);
        List<Pedido> pedidos = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            pedidos.add(new Pedido(i, "cliente-" + (i % 1000), i % 20));
        }
        long depois = bean.getThreadAllocatedBytes(tid);

        long bytes = depois - antes;
        System.out.printf("total=%.1f MB, por pedido=%.0f bytes%n",
                bytes / 1_000_000.0, (double) bytes / n);
        System.out.println(pedidos.size()); // mantém a lista viva
    }
}
```

O `getThreadAllocatedBytes` conta bytes reais alocados na heap, incluindo o array interno da lista e as strings concatenadas. Rode com `-Xms1g -Xmx1g` e depois com um heap maior: o número por pedido deve ficar estável, o que mostra que o custo é do código, não do coletor. Para perfil agregado, use JFR (`jdk.ObjectAllocationSample`) ou async-profiler no modo `alloc`.

## Na prática

Primeiro separe **pressão** de **vazamento**. Pressão: após um full GC, o old generation volta a um patamar saudável, mas enche de novo rápido. Vazamento: o patamar pós-full-GC sobe a cada ciclo até `OutOfMemoryError`. O primeiro se resolve alocando menos; o segundo, com heap dump e dominator tree.

Para ler o log, habilite:

```bash
java -Xms1g -Xmx1g -Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m -jar app.jar
```

Procure `Pause Young`, o tamanho do Eden antes e depois, `Humongous` e o tempo total. Um script curto extrai as pausas:

```java
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class AnaliseGcLog {
    private static final Pattern PAUSA = Pattern.compile("Pause Young.*?(\\d+[.,]\\d+)ms");

    public static void main(String[] args) throws Exception {
        double total = 0;
        int coletas = 0;

        for (String linha : Files.readAllLines(Path.of("gc.log"))) {
            Matcher m = PAUSA.matcher(linha);
            if (m.find()) {
                total += Double.parseDouble(m.group(1).replace(',', '.'));
                coletas++;
            }
        }

        System.out.printf("coletas=%d pausa_total=%.1f ms media=%.2f ms%n",
                coletas, total, coletas == 0 ? 0 : total / coletas);
    }
}
```

Com números na mão, as alavancas ficam claras. Aumentar o young generation (`-XX:G1NewSizePercent`, `-XX:G1MaxNewSizePercent`) reduz a frequência de coletas e dá tempo para objetos morrerem, ao custo de pausas maiores. Aumentar o heap inteiro ajuda se o live set cresceu, mas piora pausas e pressão de memória do container. `-XX:MaxGCPauseMillis=100` é uma meta de best effort, não uma garantia. Para objetos grandes e recorrentes, ajuste `-XX:G1HeapRegionSize` ou elimine o padrão de alocação.

## Armadilhas comuns

- **Igualar `-Xmx` ao limite do pod.** Não sobra espaço para metaspace, stacks, code cache e buffers nativos; o processo morre por OOM do sistema, sem heap dump.
- **Achar que mais heap resolve alocação alta.** Se a taxa é 3 GB/s, um heap maior só aumenta o intervalo entre coletas e o tamanho do trabalho.
- **Fazer pooling de objetos pequenos.** A alocação em TLAB custa poucos nanossegundos; o pool adiciona sincronização, estado e vazamento. Reserve pools para conexões, threads e buffers caros.
- **Ignorar objetos humongous.** Um `byte[]` de 40 MB em regiões de 8 MB ocupa regiões inteiras e pode disparar coletas caras.
- **Esquecer buffers diretos.** `ByteBuffer.allocateDirect` vive fora do heap; sem `-XX:MaxDirectMemorySize`, o limite é a RAM do processo.
- **Usar `System.gc()` como tuning.** É caro, pode ser desabilitado e não corrige retenção.

## Checklist de domínio

- [ ] Você calcula taxa de alocação a partir do Eden e do intervalo entre coletas
- [ ] Você distingue pressão de memória de vazamento
- [ ] Você lê um GC log do G1 e identifica young, mixed e humongous
- [ ] Você escolhe entre mexer no young, no heap ou no código com base em medida
- [ ] Você reconhece quando um pool manual é pior que alocar

## Para ir além

- [Oracle — HotSpot GC Tuning Guide](https://docs.oracle.com/en/java/javase/21/gctuning/)
- [Oracle — java command](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html)
- [JEP 439 — Generational ZGC](https://openjdk.org/jeps/439)
