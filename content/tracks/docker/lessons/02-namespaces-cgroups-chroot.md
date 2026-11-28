> **Em uma frase:** um container é um processo Linux comum ao qual o kernel dá uma visão restrita do sistema (namespaces), um teto de consumo (cgroups) e uma raiz de arquivos própria (`pivot_root`); não existe nenhum "módulo de container" além dessas três peças.

## O problema

A `pedidos-api` roda bem no notebook e, em produção, reinicia a cada poucos minutos. O `docker ps -a` mostra `Exited (137)`. Sem log de erro, sem stack trace e sem `OutOfMemoryError`. Outro sintoma, no mesmo cluster: o serviço tem **meia CPU** de limite, mas o pool de threads foi dimensionado como se a máquina tivesse 32 núcleos, e a latência oscila de forma estranha.

Os dois problemas se explicam pelas mesmas peças do kernel. Quem as conhece lê o 137 como "o kernel matou o processo por memória" e o pool de threads como "a JVM enxerga CPUs que o container não pode usar". Quem as ignora fica adivinhando.

## Como funciona

Duas famílias de recursos do kernel fazem o isolamento, e cada uma responde a uma pergunta diferente.

**Namespaces: o que o processo enxerga.** Cada tipo de namespace dá ao processo uma visão própria de um recurso global. O Linux tem oito:

| Namespace | O que isola |
|---|---|
| `pid` | a árvore de processos (o primeiro processo é o PID 1 do namespace) |
| `net` | interfaces, rotas, portas, regras de iptables |
| `mnt` | a tabela de montagens, e portanto a raiz do sistema de arquivos |
| `uts` | hostname e domainname |
| `ipc` | filas de mensagens e memória compartilhada |
| `user` | mapeamento de UIDs e GIDs |
| `cgroup` | a raiz da hierarquia de cgroups que o processo vê |
| `time` | os relógios monotônico e de boot |

Eles são criados com `clone()` e `unshare()` e flags como `CLONE_NEWPID`. O mesmo processo tem **um PID por namespace de PID** em que aparece: dentro do container o `java` é o PID 1, no host é o PID 4231. Você lista os namespaces de um processo em `/proc/<pid>/ns`. Por padrão o Docker **não** isola o namespace `user`: o root do container é o root do host, só que com capacidades reduzidas. O mapeamento de UIDs (`userns-remap`, ou o modo *rootless*) é opcional, e a aula 25 o retoma.

**cgroups: quanto o processo pode usar.** Os *control groups* (versão 2, unificada em `/sys/fs/cgroup`) agrupam processos e aplicam limites e contabilidade. Dois arquivos importam logo de cara:

- `cpu.max` tem o formato `quota período`, em microssegundos. `50000 100000` significa 50 ms de CPU a cada 100 ms: **meia CPU**. Ao gastar a quota, o grupo é **estrangulado** (*throttled*) até o fim do período. O processo não morre, só para, e a latência sobe. O `cpu.stat` mostra `nr_throttled` e `throttled_usec`.
- `memory.max` é um teto rígido. Quando o grupo o ultrapassa e o kernel não consegue recuperar páginas, o **OOM killer** mata um processo do grupo com `SIGKILL`. O exit code é **137** (128 + 9). Não há exceção para capturar.

`docker run --cpus 0.5 -m 512m` apenas escreve esses dois valores no cgroup do container.

**A raiz própria: `chroot` e `pivot_root`.** O `chroot` muda o diretório que o processo considera `/`, mas não troca a tabela de montagens: um processo com privilégios consegue escapar dele. O runtime usa o `pivot_root` dentro de um **namespace de montagem** novo: troca a raiz do namespace pelo sistema de arquivos da imagem e **desmonta a antiga**. É assim que o `/` do container é a imagem (aula 5) e o `/` do host deixa de existir para ele.

## Na prática

Veja os namespaces e os limites com as ferramentas do próprio Linux. Esses comandos funcionam no Docker Desktop e no Linux:

```bash
docker run --rm alpine ls /proc/self/ns
docker run --rm --cpus 0.5 -m 512m alpine sh -c 'cat /sys/fs/cgroup/cpu.max /sys/fs/cgroup/memory.max'
docker run --rm --privileged alpine unshare --pid --fork --mount-proc ps
```

A saída do segundo é `50000 100000` e `536870912` (512 MiB). A do terceiro mostra o `ps` como PID 1: um namespace de PID criado à mão, sem Docker. Para provar que a JVM respeita os cgroups, rode o programa abaixo dentro e fora de um container:

```java
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public class CgroupInfo {
    public static void main(String[] args) {
        Runtime rt = Runtime.getRuntime();
        System.out.println("availableProcessors = " + rt.availableProcessors());
        System.out.println("heap máximo (MiB)   = " + rt.maxMemory() / (1024 * 1024));

        String cpuMax = ler("/sys/fs/cgroup/cpu.max");
        String memMax = ler("/sys/fs/cgroup/memory.max");
        System.out.println("cpu.max             = " + cpuMax);
        System.out.println("memory.max          = " + memMax);

        String[] partes = cpuMax.split(" ");
        if (partes.length == 2 && !partes[0].equals("max")) {
            double cpus = Double.parseDouble(partes[0]) / Double.parseDouble(partes[1]);
            System.out.printf("quota               = %.2f CPU -> a JVM enxerga %d%n", cpus, (int) Math.ceil(cpus));
        } else {
            System.out.println("sem quota de CPU: a JVM enxerga as CPUs do host");
        }
    }

    private static String ler(String caminho) {
        try {
            return Files.readString(Path.of(caminho)).trim();
        } catch (IOException e) {
            return "indisponível";
        }
    }
}
```

Com `docker run --rm --cpus 0.5 -m 512m -v "$PWD:/app" eclipse-temurin:21-jdk java /app/CgroupInfo.java`, a saída é `availableProcessors = 1`, `cpu.max = 50000 100000`, `memory.max = 536870912` e um heap máximo de cerca de **123 MiB**: a JVM usa um quarto do limite de memória como heap padrão. Com `--cpus 2.5`, ela enxerga 3 processadores: a quota é **arredondada para cima**. Sem limite algum, enxerga todas as CPUs do host, e é nesse caso que um pool dimensionado por `availableProcessors()` fica maior do que o container consegue sustentar.

## Armadilhas comuns

- **Confundir `OOMKilled` com `OutOfMemoryError`.** O primeiro é o kernel matando o processo (137, sem stack trace); o segundo é a JVM sem heap. Confira `docker inspect -f '{{.State.OOMKilled}}'`.
- **Fixar `-Xmx` igual ao limite do container.** O processo usa muito além do heap (metaspace, stacks, buffers diretos). Com `-Xmx512m` em um container de 512 MiB, o OOM killer chega antes do GC.
- **Achar que `--cpus 0.5` deixa o container "mais lento".** Ele roda na velocidade normal e **para** quando gasta a quota. O efeito é latência de cauda, não uma CPU mais fraca. Veja `nr_throttled` no `cpu.stat`.
- **Tomar o root do container como inofensivo, ou o contrário.** Sem `user namespace`, o UID 0 do container é o UID 0 do host, restringido por capacidades e seccomp (aula 25).
- **Usar `chroot` como isolamento.** Ele não substitui o mount namespace com `pivot_root`.

## Checklist de domínio

- [ ] Você lista os oito namespaces e diz o que cada um isola
- [ ] Você escreve de cabeça o `cpu.max` de `--cpus 0.5` e o que acontece ao estourar a quota
- [ ] Você explica o 137 e distingue OOM kill de `OutOfMemoryError`
- [ ] Você sabe por que o runtime usa `pivot_root` e não `chroot`
- [ ] Você mostra que a JVM lê o cgroup para escolher CPUs e heap

## Para ir além

- [man7.org: namespaces(7)](https://man7.org/linux/man-pages/man7/namespaces.7.html)
- [man7.org: cgroups(7)](https://man7.org/linux/man-pages/man7/cgroups.7.html)
- [man7.org: pivot_root(2)](https://man7.org/linux/man-pages/man2/pivot_root.2.html)
- [Kernel: Control Group v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Docker: limites de recursos dos containers](https://docs.docker.com/engine/containers/resource_constraints/)
