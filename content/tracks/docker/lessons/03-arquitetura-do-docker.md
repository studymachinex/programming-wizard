> **Em uma frase:** o `docker` que você digita é só um cliente REST; quem cria o container é uma cadeia de programas (dockerd, containerd, containerd-shim e runc), e o contrato entre as pontas dessa cadeia é padronizado pela OCI.

## O problema

Você roda `docker run -d --name web -p 8080:80 nginx:1.27` e o container sobe. Semanas depois, três situações pedem mais do que "o Docker faz isso":

- o `dockerd` é reiniciado para uma atualização de patch e os containers de produção **morrem junto**, ou **sobrevivem**, dependendo de uma opção que ninguém conhecia;
- o cluster Kubernetes passa a usar o containerd direto, e o `docker ps` do nó mostra **zero containers**;
- um container não inicia e a mensagem vem de um programa que você nunca ouviu falar: `OCI runtime create failed: runc create failed`.

Para depurar qualquer uma delas, é preciso saber **quem faz o quê** entre o seu terminal e o processo.

## Como funciona

O caminho de um `docker run` atravessa cinco programas:

```text
docker CLI  --REST/HTTP-->  dockerd  --gRPC-->  containerd  -->  containerd-shim  -->  runc  -->  processo
            (docker.sock)                                         (um por container)   (cria e sai)
```

1. **docker CLI.** Traduz o comando em chamadas à **Engine API**, uma API REST. Por padrão, ela escuta no socket Unix `/var/run/docker.sock`. O CLI não tem lógica de container: troque o cliente por `curl`, por um SDK ou por um cliente Java (aula 20) e o resultado é o mesmo.
2. **dockerd.** O daemon. Expõe a API e cuida do que é de alto nível: imagens, redes, volumes, o `docker build` (via BuildKit) e o `docker logs`. Antes de pedir o container, ele resolve a imagem e prepara rede e montagens.
3. **containerd.** Um daemon mais enxuto, que controla o **ciclo de vida** dos containers e guarda imagens e snapshots em disco. O dockerd o chama por **gRPC**. O Kubernetes também fala com o containerd diretamente, sem o dockerd, e é por isso que ele é um projeto separado.
4. **containerd-shim** (`containerd-shim-runc-v2`). Um processo pequeno por container. Ele é o **pai do processo do container**, guarda o `stdout` e o `stderr` e o código de saída, e permite que o containerd seja reiniciado sem derrubar ninguém.
5. **runc.** O executor de baixo nível. Recebe um *bundle* (o rootfs da imagem mais um `config.json`) e faz o trabalho do kernel: `clone()` com as flags de namespace, aplica os cgroups, troca a raiz com `pivot_root`, descarta capacidades e faz o `exec` do processo. Depois disso, **o runc termina**. Quem fica vivo é o shim.

A conversa é padronizada pela **Open Container Initiative (OCI)**, com três especificações: a de **runtime** (como rodar um bundle, o contrato do `runc`), a de **imagem** (o formato: manifesto, config e camadas) e a de **distribuição** (a API HTTP de push e pull de um registry). Graças a elas, uma imagem construída no Docker roda no containerd, no Podman e no Kubernetes, e o `runc` pode ser trocado por `crun`, gVisor ou Kata sem mudar a imagem.

Dois detalhes de operação decorrem dessa arquitetura. Com `"live-restore": true` no `daemon.json`, os containers continuam rodando enquanto o dockerd está parado, porque o shim e o processo não dependem dele; sem a opção, reiniciar o daemon para os containers. E o `docker ps` só mostra o que o **dockerd** conhece: containers criados diretamente no containerd (o caso do Kubernetes) ficam em outro *namespace* do containerd e não aparecem nele.

## Na prática

Veja os componentes que seu Docker usa:

```bash
docker version
docker info --format '{{.DefaultRuntime}} {{.Runtimes}}'
```

O `docker version` lista o **Client** e o **Server**, e o Server tem um bloco por componente: `Engine`, `containerd`, `runc` e `docker-init`, cada um com a sua versão. Com um container rodando, num host Linux, a cadeia aparece na árvore de processos:

```bash
ps -ef --forest | grep -E 'dockerd|containerd|nginx'
```

Você vê o `dockerd`, o `containerd`, um `containerd-shim-runc-v2 -namespace moby -id <id do container>` e, como filho do shim, o `nginx`. Repare que **não há `runc` na lista**: ele já saiu. Para falar com a API sem o CLI, basta o socket. O programa abaixo, em Java puro (JDK 16 ou superior), faz o mesmo que `curl --unix-socket /var/run/docker.sock http://localhost/version`:

```java
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.Channels;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

public class DockerSocket {
    public static void main(String[] args) throws Exception {
        Path socket = Path.of(args.length > 0 ? args[0] : "/var/run/docker.sock");
        try (SocketChannel canal = SocketChannel.open(StandardProtocolFamily.UNIX)) {
            canal.connect(UnixDomainSocketAddress.of(socket));
            String requisicao = "GET /version HTTP/1.0\r\nHost: docker\r\n\r\n";
            canal.write(ByteBuffer.wrap(requisicao.getBytes(StandardCharsets.US_ASCII)));
            System.out.println(new String(Channels.newInputStream(canal).readAllBytes(), StandardCharsets.UTF_8));
        }
    }
}
```

A resposta é `HTTP/1.0 200 OK`, com cabeçalhos como `Api-Version` e `Server: Docker/<versão> (linux)`, e um JSON com a plataforma e a lista de componentes (`Engine`, `containerd`, `runc`). Para rodar no seu host, use `java DockerSocket.java`. Dentro de um container, é preciso montar o socket (`-v /var/run/docker.sock:/var/run/docker.sock`), o que dá ao container controle total do Docker do host: use só em ferramentas de confiança.

## Armadilhas comuns

- **Montar o `docker.sock` dentro de containers sem pensar.** Quem alcança o socket cria containers privilegiados e monta o disco do host. Equivale a acesso root.
- **Reiniciar o dockerd em produção sem `live-restore`.** Sem a opção, os containers param junto, e o patch de segurança vira uma indisponibilidade.
- **Procurar no `docker ps` os containers do Kubernetes.** Em nós que usam o containerd direto, a ferramenta certa é `crictl ps` (ou `ctr -n k8s.io containers ls`).
- **Ler `runc create failed` como erro do Docker.** A mensagem vem do runtime: quase sempre é um limite do kernel, uma montagem que não existe ou um `ENTRYPOINT` inexistente. A causa está no `config.json` que o runc recebeu.
- **Assumir que "Docker" e "container" são sinônimos.** Docker é uma ferramenta que reúne CLI, daemon, build e orquestração local sobre os padrões da OCI.

## Checklist de domínio

- [ ] Você desenha de memória o caminho CLI → dockerd → containerd → shim → runc → processo
- [ ] Você explica por que o runc termina e o shim fica
- [ ] Você diz o que o `live-restore` faz e por que ele é possível
- [ ] Você nomeia as três especificações da OCI e o que cada uma define
- [ ] Você sabe falar com a Engine API sem o CLI e por que o `docker.sock` é sensível

## Para ir além

- [Docker Engine: visão geral da arquitetura](https://docs.docker.com/engine/)
- [Docker Engine API](https://docs.docker.com/reference/api/engine/)
- [Live restore: manter containers vivos durante a indisponibilidade do daemon](https://docs.docker.com/engine/containers/live-restore/)
- [Open Container Initiative: especificações](https://opencontainers.org/about/overview/)
- [OCI runtime-spec](https://specs.opencontainers.org/runtime-spec/)
