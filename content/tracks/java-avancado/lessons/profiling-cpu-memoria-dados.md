> **Em uma frase:** profiling é transformar "está lento" em uma hipótese sobre uma função, uma alocação ou uma espera — e depois medir se a mudança realmente moveu o número.

## O problema

O CPU está em 100%, o flame graph mostra `String.hashCode` no topo e o time passa a semana micro-otimizando hash. Na semana seguinte, descobrem que o gargalo era um `HashMap` com milhões de chaves calculadas a cada request; o hash era sintoma, não causa. Em outro caso, o gráfico de CPU está saudável, mas o p99 é terrível: as threads passam o tempo esperando um pool de conexões, e nenhum profiler de CPU vê isso.

Otimizar sem separar CPU, alocação, lock e espera é escolher o suspeito mais visível. O dado precisa responder a uma pergunta específica.

## Como funciona

Profilers de CPU fazem **amostragem**: a cada intervalo, capturam a stack da thread que está rodando. Em 60 segundos a 100 Hz, são cerca de 6.000 amostras. Uma função presente em 600 amostras responde por ~10% do tempo — com margem de erro que depende da variância, não do número de amostras isolado. Amostras demais custam overhead; poucas produzem conclusões frágeis.

O **flame graph** agrega essas stacks. A largura de uma barra é a proporção de amostras, não tempo cronológico; o eixo X é ordenado por nome, não por ordem de execução. A barra no topo representa tempo **self** (a função sem os filhos); a pilha abaixo é o caminho de chamada. Leia de baixo para cima para achar a origem e foque na barra larga mais próxima da folha.

```java
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

public class CargaParaPerfil {
    static final byte[] BLOCO = new byte[4096];

    public static void main(String[] args) throws Exception {
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        List<String> retidos = new ArrayList<>();

        long fim = System.nanoTime() + 30_000_000_000L; // 30 segundos
        int i = 0;
        while (System.nanoTime() < fim) {
            byte[] hash = sha.digest(BLOCO);       // CPU + alocação
            if (i++ % 1000 == 0) {
                retidos.add(new String(hash));      // pressão no heap
            }
            if (retidos.size() > 10_000) {
                retidos.clear();                   // evita crescimento infinito
            }
        }
        System.out.println("iterações=" + i);
    }
}
```

Rode essa classe, pegue o PID com `jcmd` ou `jps` e colete com ferramentas diferentes para responder perguntas diferentes. `async-profiler` é leve e gera o HTML direto:

```bash
asprof -d 30 -e cpu -f cpu.html <pid>
asprof -d 30 -e alloc -f alloc.html <pid>
asprof -d 30 -e lock -f lock.html <pid>
```

`-e cpu` mostra tempo de CPU; `-e alloc` mostra onde os bytes são alocados; `-e lock` mostra contenção de monitores; `-e wall` mostra tempo de parede, incluindo bloqueio — essencial quando o sintoma é latência e a CPU está ociosa. JFR é a opção nativa, com overhead baixo e eventos de GC, I/O e threads:

```bash
jcmd <pid> JFR.start name=perfil settings=profile duration=60s filename=app.jfr
jfr summary app.jfr
jfr view hot-methods app.jfr
```

Para memória, `jcmd <pid> GC.class_histogram` mostra classes e bytes, mas não caminhos de referência. Um heap dump (`jcmd <pid> GC.heap_dump /tmp/heap.hprof`) analisado no Eclipse MAT permite ver **shallow size** (o objeto sozinho) e **retained size** (o que ele mantém vivo), além da dominator tree e das GC roots. O vazamento costuma estar no caminho de retenção, não na classe maior.

## Na prática

Programaticamente, o JFR também pode ser gravado de dentro da aplicação — útil para um endpoint de diagnóstico temporário:

```java
import jdk.jfr.Recording;
import jdk.jfr.consumer.RecordedEvent;
import jdk.jfr.consumer.RecordedFrame;
import jdk.jfr.consumer.RecordedStackTrace;
import jdk.jfr.consumer.RecordingFile;

import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

public class PerfilComJfr {
    public static void main(String[] args) throws Exception {
        Path destino = Path.of("perfil.jfr");

        try (Recording recording = new Recording()) {
            recording.enable("jdk.ExecutionSample").withPeriod(Duration.ofMillis(10));
            recording.start();
            carga();
            recording.stop();
            recording.dump(destino);
        }

        Map<String, Integer> amostras = new HashMap<>();
        RecordingFile arquivo = new RecordingFile(destino);
        try {
            while (arquivo.hasMoreEvents()) {
                RecordedEvent evento = arquivo.readEvent();
                RecordedStackTrace stack = evento.getStackTrace();
                if (stack == null || stack.getFrames().isEmpty()) continue;
                RecordedFrame frame = stack.getFrames().get(0);
                String nome = frame.getMethod().getDeclaringType().getName()
                        + "." + frame.getMethod().getName();
                amostras.merge(nome, 1, Integer::sum);
            }
        } finally {
            arquivo.close();
        }

        amostras.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .limit(10)
                .forEach(e -> System.out.printf("%5d %s%n", e.getValue(), e.getKey()));
    }

    static void carga() {
        long soma = 0;
        for (int i = 0; i < 50_000_000; i++) {
            soma += Integer.bitCount(i * 31);
        }
        if (soma == 42) System.out.println(soma);
    }
}
```

O ciclo correto é: medir a linha de base sob carga real; formular uma hipótese; mudar **uma** variável; medir de novo com a mesma carga e as mesmas flags; verificar se o ganho aparece no throughput e no p99, não só na média. Se a mudança melhora um endpoint e piora outro, você encontrou um trade-off, não uma vitória.

## Armadilhas comuns

- **Ler flame graph como linha do tempo.** A largura é frequência agregada; a ordem no eixo X não é cronológica.
- **Perfilar CPU e concluir sobre latência.** Threads bloqueadas em I/O, lock ou pool não aparecem no perfil de CPU. Use wall time, JFR de monitor enter ou thread dumps.
- **Amostra pequena.** 40 amostras não sustentam uma decisão sobre 2% de CPU. Colete tempo suficiente e repita.
- **Confundir alocação com retenção.** O allocation profile mostra quem cria; o heap dump mostra quem mantém vivo. São perguntas diferentes.
- **Otimizar o topo do gráfico sem olhar o caminho.** A função quente pode ser vítima de um chamador que a invoca demais.
- **Perfilar em idle ou em staging com carga irreal.** O perfil reflete a carga que você deu a ele.

## Checklist de domínio

- [ ] Você escolhe entre CPU, wall, alloc e lock conforme o sintoma
- [ ] Você lê um flame graph de baixo para cima e identifica self time
- [ ] Você coleta JFR em processo vivo e extrai métodos quentes
- [ ] Você usa heap dump e dominator tree para achar retenção
- [ ] Você fecha o ciclo medir-otimizar-medir sem regressão

## Para ir além

- [async-profiler](https://github.com/async-profiler/async-profiler)
- [Oracle — jfr command](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jfr.html)
- [JEP 328 — Flight Recorder](https://openjdk.org/jeps/328)
