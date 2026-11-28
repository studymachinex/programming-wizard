> **Em uma frase:** um container passa por estados bem definidos (`created`, `running`, `paused`, `exited`, `removed`), cada comando do Docker manda um sinal ou uma operação específica ao processo, e o que importa para produção é entender o que `stop`, `kill`, `pause` e `rm` fazem de verdade com o seu código.

## O problema

O deploy da `pedidos-api` leva exatamente 10 segundos por instância e, ao terminar, o `docker ps -a` mostra `Exited (137)`. Os pedidos em andamento são cortados no meio, e o time acha que "o Docker é assim". Em outro ponto, alguém roda `docker kill` "para parar o container direito", e o shutdown hook que fecha o pool de conexões nunca roda.

Quase todo mistério de ciclo de vida se resolve conhecendo três fatos: quais estados existem, qual sinal cada comando envia ao **PID 1** do container e o que cada estado preserva em disco.

## Como funciona

Os estados que o `docker ps -a` e o `docker inspect` mostram:

| Estado | O que significa |
|---|---|
| `created` | configuração e camada gravável existem; **nenhum processo** |
| `running` | o processo principal (PID 1) está em execução |
| `paused` | processos congelados pelo **freezer do cgroup** |
| `restarting` | a política de restart está recriando o processo |
| `exited` | o processo terminou; a camada gravável e o código de saída ficam |
| `removing` / `dead` | em remoção; ou remoção que falhou e deixou resíduos |

E os comandos que movem um container entre eles:

- **`docker create`** monta o container sem iniciar. **`docker start`** cria o processo. **`docker run`** é `create` mais `start` (e `pull` se faltar a imagem).
- **`docker stop`** envia **SIGTERM** ao PID 1 e espera até **10 segundos** (`-t` muda o prazo). Se o processo ainda estiver vivo, envia **SIGKILL**. O sinal pode ser trocado na imagem, com `STOPSIGNAL`.
- **`docker kill`** envia **SIGKILL** direto (ou o sinal de `-s`), sem espera.
- **`docker pause`** congela o container com o freezer do cgroup. O processo **não é notificado** e não pode reagir; a memória continua ocupada. **`docker unpause`** descongela.
- **`docker restart`** é um `stop` seguido de `start`. **`docker rm`** apaga o container e a camada gravável (`-f` faz um `kill` antes). **`docker run --rm`** remove o container assim que o processo termina.

O **código de saída** conta a história do fim: `0` (terminou bem), `143` (128 + 15, encerrado por SIGTERM, e a JVM sai assim depois de rodar os shutdown hooks), `137` (128 + 9, morto por SIGKILL, seja do `docker kill`, do timeout do `stop` ou do OOM killer) e `1` ou outro (o processo falhou). Um container `exited` **mantém** a camada gravável: `docker start` o reinicia com os mesmos arquivos. Por isso `docker ps -a` acumula containers parados e ocupa disco.

O ponto central: o SIGTERM só chega à aplicação se o **PID 1** do container for ela. Se o PID 1 for um `sh -c`, o shell não repassa o sinal, o `stop` espera os 10 segundos inteiros e termina com SIGKILL. A aula 15 aprofunda `ENTRYPOINT`, `CMD` e o `--init`.

## Na prática

Comande o ciclo à mão:

```bash
docker create --name api loja/api:1.0
docker ps -a --filter name=api --format '{{.Names}} {{.Status}}'

docker start api
docker pause api && docker ps --format '{{.Names}} {{.Status}}'
docker unpause api

docker stop api
docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' api
docker start api && docker rm -f api
```

O programa abaixo é uma aplicação Java que **trata o SIGTERM**: o shutdown hook roda quando a JVM recebe o sinal (ou `System.exit`), e é o lugar de fechar conexões e terminar o trabalho em andamento. Com `--simular`, ele sai sozinho depois de iniciar, para você testar o hook sem Docker:

```java
public class Servico {
    public static void main(String[] args) throws Exception {
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("SIGTERM recebido: terminando as requisições em andamento...");
            dormir(500); // simula a drenagem de conexões
            System.out.println("encerrado com elegância");
        }, "shutdown"));

        System.out.println("serviço pronto, PID " + ProcessHandle.current().pid());
        if (args.length > 0 && args[0].equals("--simular")) {
            System.exit(0); // para testar o hook sem precisar do docker stop
        }
        Thread.currentThread().join(); // fica vivo até receber um sinal
    }

    private static void dormir(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

Rode-o de duas formas e compare, com a imagem `eclipse-temurin:21-jdk` e o arquivo montado em `/app`:

```bash
docker run -d --name s1 -v "$PWD:/app" eclipse-temurin:21-jdk java /app/Servico.java
docker stop s1; docker logs s1; docker ps -a --filter name=s1 --format '{{.Status}}'

docker run -d --name s2 -v "$PWD:/app" eclipse-temurin:21-jdk sh -c 'java /app/Servico.java; echo fim'
docker stop s2; docker logs s2; docker ps -a --filter name=s2 --format '{{.Status}}'
```

No primeiro caso o log mostra as duas mensagens do hook e o status `Exited (143)`. No segundo, o log termina em `serviço pronto, PID 7` (a JVM não é o PID 1) e o status é `Exited (137)`, depois de 10 segundos de espera.

## Armadilhas comuns

- **PID 1 que não repassa sinais.** `CMD java -jar app.jar` em *shell form* roda sob `/bin/sh -c`. O `stop` vira 10 s de espera mais SIGKILL, e nenhum shutdown hook roda. Use a forma de lista (*exec form*).
- **Usar `docker kill` para o desligamento normal.** SIGKILL não pode ser tratado: conexões ficam penduradas e transações, incompletas. Reserve-o para o que travou.
- **Confundir `pause` com `stop`.** O container pausado continua ocupando memória e não fecha conexões de rede; clientes veem timeouts, não um encerramento limpo.
- **Acumular containers `exited`.** Cada um mantém a camada gravável. `docker container prune` limpa os parados; em tarefas descartáveis, use `--rm`.
- **Perder dados ao recriar.** `restart` preserva a camada gravável, mas `rm` e o `docker run` seguinte começam do zero. Dados que importam vão em volume.

## Checklist de domínio

- [ ] Você lista os estados de um container e diz o que cada um preserva
- [ ] Você diferencia `stop` (SIGTERM e depois SIGKILL) de `kill` (SIGKILL) e de `pause` (freezer)
- [ ] Você lê os códigos 0, 143 e 137
- [ ] Você explica por que um `sh -c` como PID 1 faz o `stop` demorar 10 s
- [ ] Você escreve um shutdown hook que encerra o trabalho com elegância

## Para ir além

- [docker container stop](https://docs.docker.com/reference/cli/docker/container/stop/)
- [docker container kill](https://docs.docker.com/reference/cli/docker/container/kill/)
- [docker container pause](https://docs.docker.com/reference/cli/docker/container/pause/)
- [man7.org: signal(7)](https://man7.org/linux/man-pages/man7/signal.7.html)
- [Kernel: cgroup freezer (Control Group v2)](https://docs.kernel.org/admin-guide/cgroup-v2.html)
