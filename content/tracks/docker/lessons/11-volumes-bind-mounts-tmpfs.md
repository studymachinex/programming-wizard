> **Em uma frase:** a camada gravável de um container morre com ele, então tudo que precisa sobreviver (ou que não deve ir para a imagem) mora em uma **montagem**: um *volume* gerenciado pelo Docker, um *bind mount* de um caminho do host ou um *tmpfs* na memória, e cada um se comporta de um jeito diferente quando o container é removido.

## O problema

Na aula 5 você viu o copy-on-write: tudo que o container escreve vai para uma camada gravável, ligada ao ciclo de vida dele. O time sobe um Postgres com `docker run postgres:16`, cadastra duas semanas de pedidos de teste, roda `docker rm -f` para atualizar a versão e descobre que o banco voltou vazio. Em outra ponta, alguém quer editar o código no editor do host e ver o efeito dentro do container sem refazer a imagem; e um terceiro precisa de um diretório de *cache* que **nunca** deve tocar o disco.

São três necessidades diferentes, e o Docker tem uma montagem para cada: **persistir** (volume), **compartilhar com o host** (bind mount) e **ser efêmero e rápido** (tmpfs). Escolher errado causa perda de dados, permissões quebradas ou um disco do host cheio de lixo.

## Como funciona

Uma montagem coloca um diretório de fora no sistema de arquivos do container, **por cima** do que a imagem tinha naquele caminho. O processo enxerga um diretório comum; a diferença está em quem é o dono do armazenamento.

| Tipo | Onde vive | Sobrevive ao `docker rm`? | Uso típico |
|---|---|---|---|
| Volume nomeado | `/var/lib/docker/volumes/<nome>/_data`, gerenciado pelo Docker | Sim | bancos, uploads, dados da aplicação |
| Volume anônimo | igual ao nomeado, com nome aleatório de 64 caracteres | Não é removido sozinho (órfão), a menos que use `--rm` ou `rm -v` | acidente comum (`VOLUME` no Dockerfile) |
| Bind mount | um caminho **do host** que você escolhe | Sim, é o seu arquivo | código em desenvolvimento, arquivo de configuração |
| tmpfs | memória RAM do host (só Linux) | Não, some quando o container para | cache, segredo temporário, arquivos de sessão |

Duas regras de comportamento valem a pena memorizar:

1. **Volume vazio é populado com o conteúdo da imagem** no primeiro uso. Se a imagem tem arquivos em `/etc/ssl` e você monta um volume novo (vazio) nesse caminho, o Docker copia o conteúdo da imagem para o volume antes de entregar. Um **bind mount não faz isso**: ele cobre o diretório da imagem e mostra só o que existe no host. Montar uma pasta vazia do host em `/app` esconde o seu `app.jar`.
2. Volumes são independentes de containers. Um mesmo volume pode ser montado em vários containers ao mesmo tempo (cuidado com escritas concorrentes: o Docker não coordena nada), e continua existindo quando todos somem.

Há duas sintaxes. A curta, `-v origem:destino[:opções]`, e a explícita, `--mount type=...,src=...,dst=...`. A diferença que importa em produção: com `-v`, se o caminho do host **não existe**, o Docker o cria como um diretório de dono root, e um erro de digitação passa em silêncio; com `--mount type=bind`, o container **falha ao iniciar** com `bind source path does not exist`. Prefira `--mount` em scripts e em CI.

```bash
docker run -d --name db --mount type=volume,src=pgdata,dst=/var/lib/postgresql/data postgres:16   # volume nomeado, criado se não existir

docker run -d -p 8080:8080 \
  --mount type=bind,src="$PWD/application.yml",dst=/app/application.yml,readonly \
  loja/api:1.0   # bind mount somente leitura: lê a config, mas não a altera

docker run -d --tmpfs /cache:rw,size=64m,noexec loja/api:1.0   # tmpfs de 64 MB, some quando o container para
```

O sufixo `:ro` (ou `readonly`) monta em somente leitura: qualquer escrita falha com `Read-only file system`. É uma defesa barata, e vale para configuração e código. Em hosts com **SELinux** (Fedora, RHEL), um bind mount normalmente dá `Permission denied` porque o rótulo do diretório não é o que o container espera. A opção `:z` reetiqueta o caminho para ser **compartilhado** entre containers, e `:Z` para ser **privado** daquele container. Cuidado: reetiquetar `/home` ou `/etc` inteiros com `:Z` quebra o resto do sistema.

O volume `local` aceita ainda opções como `type=nfs`, o que permite apontar um volume para um servidor NFS; drivers de terceiros ligam o mesmo conceito a armazenamento em nuvem. Para o container, continua sendo só um diretório.

## Na prática

O programa abaixo conta quantas vezes o container foi iniciado, gravando o número em `/data/inicios.txt`. Sem montagem, o contador recomeça de 1 a cada `docker run`, porque o arquivo está na camada gravável. Com um volume, ele continua de onde parou:

```java
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public class Contador {
    public static void main(String[] args) throws IOException {
        Path arquivo = Path.of(args.length > 0 ? args[0] : "/data/inicios.txt");
        Files.createDirectories(arquivo.getParent());
        int inicios = Files.exists(arquivo) ? Integer.parseInt(Files.readString(arquivo).trim()) : 0;
        inicios++;
        Files.writeString(arquivo, Integer.toString(inicios));
        System.out.println("início número " + inicios + " gravado em " + arquivo);
    }
}
```

Rode duas vezes seguidas, primeiro sem volume e depois com ele (o código entra por um bind mount `:ro`):

```bash
docker run --rm -v "$PWD:/app:ro" eclipse-temurin:21-jdk java /app/Contador.java   # início número 1
docker run --rm -v "$PWD:/app:ro" eclipse-temurin:21-jdk java /app/Contador.java   # início número 1 de novo

docker run --rm -v dados:/data -v "$PWD:/app:ro" eclipse-temurin:21-jdk java /app/Contador.java   # 1
docker run --rm -v dados:/data -v "$PWD:/app:ro" eclipse-temurin:21-jdk java /app/Contador.java   # 2
```

Inspecione e limpe com os comandos de volume:

```bash
docker volume ls
docker volume inspect dados          # mostra o Mountpoint no host
docker container inspect db --format '{{json .Mounts}}'
docker volume rm dados               # falha se algum container (mesmo parado) ainda o usa
```

Quando usar cada um: **volume** para qualquer dado de aplicação que o Docker deve guardar; **bind mount** para o ciclo de desenvolvimento (código, arquivo de configuração) e para ler do host algo que já existe; **tmpfs** para o que não deve ser gravado em disco. Em produção, o código vai dentro da imagem e o estado vai em volumes: um bind mount de código em produção amarra o container a um caminho de uma máquina específica.

Um detalhe do Docker Desktop (Mac e Windows): como o Docker roda numa VM Linux, um bind mount atravessa um sistema de arquivos compartilhado entre o host e a VM, bem mais lento que um volume. Em projetos Java com milhares de arquivos pequenos (`node_modules`, `target`), isso pesa; o volume nomeado fica dentro da VM e é rápido. No Windows, mantenha o projeto dentro do sistema de arquivos do WSL 2, e não em `C:\`.

## Armadilhas comuns

- **Bind mount escondendo a imagem.** Montar `./app` em `/app` e descobrir que o `app.jar` sumiu: o bind cobre o diretório da imagem e não copia nada. Monte em outro caminho ou use um volume.
- **`-v` com caminho errado criando um diretório vazio.** `-v ./config.yml:/app/config.yml` com o arquivo inexistente cria um **diretório** chamado `config.yml`. Use `--mount` e deixe a falha acontecer cedo.
- **Volumes anônimos se acumulando.** Imagens como a do Postgres declaram `VOLUME` no Dockerfile; se você não nomeia o volume, cada `docker run` cria um novo, de nome aleatório. Eles não somem com o `rm`; use `docker rm -v`, `--rm` ou nomeie o volume. Desde o Docker 23, `docker volume prune` remove só os anônimos sem uso; para remover também os nomeados sem uso é preciso `-a`, e isso apaga dados de verdade.
- **Dois containers escrevendo no mesmo volume.** O Docker não faz *lock*. Dois processos gravando o mesmo arquivo SQLite ou o mesmo diretório de dados de um banco corrompem tudo; compartilhe volumes só entre escritor único e leitores.
- **tmpfs sem limite.** O tmpfs conta contra a memória do container: um cache que cresce até o limite do cgroup vira `OOMKilled` (exit 137). Defina `size=`.
- **Guardar segredo em bind mount e esquecer de proteger o host.** O arquivo continua legível no host por quem tiver acesso; trate o diretório como sensível.

## Checklist de domínio

- [ ] Você diferencia volume nomeado, bind mount e tmpfs e diz o que cada um preserva depois do `docker rm`
- [ ] Você explica por que um volume novo recebe o conteúdo da imagem e um bind mount esconde essa pasta
- [ ] Você escolhe entre `-v` e `--mount` e sabe por que `--mount` falha mais cedo
- [ ] Você usa `:ro` e entende `:z` e `:Z` em hosts com SELinux
- [ ] Você lista e remove volumes sem apagar dados que ainda importam

## Para ir além

- [Docker Docs: Volumes](https://docs.docker.com/engine/storage/volumes/)
- [Docker Docs: Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
- [Docker Docs: tmpfs mounts](https://docs.docker.com/engine/storage/tmpfs/)
- [docker volume prune](https://docs.docker.com/reference/cli/docker/volume/prune/)
