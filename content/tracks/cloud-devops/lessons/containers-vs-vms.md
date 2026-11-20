> **Em uma frase:** container não é uma VM pequena; é um processo Linux com uma visão própria do sistema, limitado por cgroups — e quase todo incidente estranho em Docker começa quando alguém esquece disso.

## O problema

Você sobe a `pedidos-api` em um container com 512 MiB de limite. A aplicação funciona no notebook, mas em produção o pod reinicia a cada poucos minutos com `OOMKilled` e exit code 137. O time aumenta o limite para 1 GiB e o problema volta dias depois, quando o tráfego cresce. Em paralelo, o pool de conexões e o pool de threads parecem dimensionados para uma máquina de 32 cores, embora o container tenha direito a apenas duas CPUs.

A causa raramente é "o Docker". É o modelo mental: um container compartilha o kernel do host e recebe limites impostos pelo cgroup. Entender o que é isolado e o que é apenas limitado explica memória, CPU, sinais, filesystem e até o comportamento da JVM.

## Como funciona

Um container é criado a partir de uma imagem, mas o que roda é um processo comum. O runtime (containerd, CRI-O, Docker Engine) monta um conjunto de namespaces e aplica cgroups antes de executar o entrypoint. Namespaces mudam *o que o processo enxerga*; cgroups mudam *quanto ele pode consumir*. Nenhum dos dois virtualiza o kernel.

| Namespace | O que isola | Efeito prático |
|---|---|---|
| `pid` | Árvore de processos | O processo principal vira PID 1 dentro do container |
| `net` | Interfaces, rotas, portas | Cada container tem sua própria pilha de rede |
| `mnt` | Pontos de montagem | O filesystem da imagem aparece como raiz |
| `user` | UIDs e GIDs | Permite root no container sem ser root no host |

Na versão 2 do cgroup, os limites ficam explícitos em arquivos como `memory.max`, `cpu.max` e `pids.max`. Quando o uso de memória passa de `memory.max`, não existe uma exceção Java: o kernel dispara o OOM killer e mata um processo do grupo. O container termina com 137 (128 + SIGKILL). Quando o limite de CPU é atingido, o processo não morre; ele é estrangulado (*throttled*) e a latência sobe.

A JVM moderna entende cgroups. Desde o JDK 10, `UseContainerSupport` lê os limites do container para calcular heap máximo e número de processadores. O detalhe é que ela lê o limite *na inicialização*. Se você fixar `-Xmx4g` em um container de 1 GiB, o heap tenta crescer até 4 GiB e o kernel mata o processo antes de qualquer `OutOfMemoryError`. Se não houver limite, a JVM pode enxergar as 64 CPUs do host e criar pools com 64 threads para um serviço que só tem 2 vCPUs.

```java
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class ContainerAwareness {
    public static void main(String[] args) {
        Runtime rt = Runtime.getRuntime();
        long mib = 1024 * 1024;

        System.out.printf("heap max: %d MiB%n", rt.maxMemory() / mib);
        System.out.printf("CPUs visíveis: %d%n", rt.availableProcessors());
        System.out.printf("cgroup memory.max: %s%n", read("/sys/fs/cgroup/memory.max"));
        System.out.printf("cgroup cpu.max: %s%n", read("/sys/fs/cgroup/cpu.max"));
    }

    private static String read(String path) {
        try {
            return Files.readString(Path.of(path)).trim();
        } catch (IOException e) {
            return "indisponível";
        }
    }
}
```

O segundo detalhe é o PID 1. Dentro do namespace, o entrypoint é o processo um. Ele precisa repassar sinais e colher filhos; se você inicia a JVM com `sh -c "java -jar app.jar"`, o shell pode virar PID 1 e a JVM não receber o SIGTERM do `docker stop`. O resultado é um shutdown de 10 segundos seguido de SIGKILL. Use a forma executiva (`ENTRYPOINT ["java", ...]`) para que a JVM seja o processo principal.

```java
import java.util.concurrent.Executors;

public final class PoolSizing {
    public static void main(String[] args) {
        // Em container, availableProcessors respeita o limite de CPU da JVM.
        int cpus = Math.max(1, Runtime.getRuntime().availableProcessors());
        int workers = cpus * 2; // mix de I/O e CPU; meça antes de copiar

        try (var pool = Executors.newFixedThreadPool(workers)) {
            for (int i = 0; i < workers; i++) {
                pool.submit(() -> System.out.println("worker " + Thread.currentThread().getName()));
            }
        }
    }
}
```

## Na prática

Coloque um limite real e observe:

```bash
docker run --rm -m 512m --cpus 1 eclipse-temurin:21-jre \
  java -XX:MaxRAMPercentage=75 -XshowSettings:vm -version

docker stats --no-stream
docker inspect -f 'mem={{.HostConfig.Memory}} oom={{.State.OOMKilled}}' pedidos-api
```

Com 512 MiB e `MaxRAMPercentage=75`, o heap máximo fica perto de 384 MiB. Os 25% restantes cobrem metaspace, code cache, stacks de threads, buffers diretos e o próprio runtime. Em uma API Quarkus em fast-jar, esse overhead costuma ficar entre 100 e 200 MiB — por isso "limite = Xmx" é uma receita de OOMKilled.

Em Kubernetes, requests e limits são coisas diferentes. `requests.memory` é o que o scheduler reserva; `limits.memory` é o teto do cgroup. Para CPU, request baixo com limit alto permite burst e pode gerar throttling quando todos os pods resolvem usar o teto ao mesmo tempo. Para serviços com latência sensível, `requests.cpu == limits.cpu` é um ponto de partida previsível, mas reduz a densidade do cluster.

## Armadilhas comuns

- **Confundir OOMKilled com `OutOfMemoryError`.** O primeiro é o kernel matando o processo (137); o segundo é a JVM sem heap e gera heap dump. Se o container morre sem stack trace, olhe `kubectl describe pod` e `.State.OOMKilled`.
- **Fixar `-Xmx` sem olhar o limite.** Um deploy que muda o limite para baixo transforma a aplicação em bomba-relógio. Prefira `MaxRAMPercentage` e valide o overhead com carga real.
- **Rodar sem limite em host compartilhado.** Um container sem `memory.max` pode consumir a máquina inteira; o OOM killer escolhe a vítima pelo score, e pode matar outro serviço.
- **Usar `docker stats` como se fosse o heap.** A memória do cgroup inclui page cache e buffers; o número não é o uso de heap da JVM.
- **Tratar o container como máquina descartável com estado.** Instalar cron, sshd e editar arquivos dentro dele cria um pet que ninguém consegue reproduzir.

## Checklist de domínio

- [ ] Você explica a diferença entre namespace e cgroup sem consultar
- [ ] Você consegue prever o heap de uma JVM com `-XX:MaxRAMPercentage` em um limite de 1 GiB
- [ ] Você diagnostica OOMKilled, throttling de CPU e PID 1 olhando `inspect`/`describe`
- [ ] Você sabe quando um limite de CPU vira latência em vez de erro

## Para ir além

- [Docker Docs — Security](https://docs.docker.com/engine/security/)
- [Linux Kernel — Control Group v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Kubernetes — Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [OpenJDK — Container Awareness](https://wiki.openjdk.org/display/HotSpot/UseContainerSupport)
