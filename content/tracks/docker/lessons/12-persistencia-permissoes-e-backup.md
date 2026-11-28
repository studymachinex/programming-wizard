> **Em uma frase:** o kernel só conhece **UIDs numéricos**, não nomes de usuário, então quem decide se o container consegue escrever no volume é o número do usuário do processo contra o número do dono do diretório; e como o volume é só um diretório, o backup mais simples é um segundo container montando o mesmo volume e rodando `tar`.

## O problema

Você aplica o conselho da aula de segurança e passa a rodar a `pedidos-api` como um usuário sem privilégios. Em desenvolvimento tudo funciona; em produção, o primeiro `POST` que grava um arquivo devolve `java.nio.file.AccessDeniedException: /data/relatorio.csv`. O volume existe, o caminho está certo e o usuário `app` "é dono" do diretório dentro da imagem. Só que o volume novo foi criado como `root`.

No mesmo mês, o banco precisa de um backup, e a ideia de copiar `/var/lib/docker/volumes/pgdata/_data` à mão parece arriscada: o diretório é do daemon, em Docker Desktop ele está dentro de uma VM, e ninguém sabe se copiar arquivos de um Postgres em execução gera um backup que abre. Permissão e backup têm a mesma raiz: entender que um volume é um diretório comum, com dono numérico, e que o acesso a ele passa por um container.

## Como funciona

### O UID numérico é o que vale

Cada arquivo guarda no disco um UID e um GID inteiros. O nome (`app`, `postgres`) vem de `/etc/passwd`, e **cada imagem tem o seu**. O mesmo número pode ter nomes diferentes dentro e fora do container, ou nenhum nome:

| Lugar | UID 999 aparece como |
|---|---|
| Imagem `postgres:16` | `postgres` |
| Imagem `redis:7` | `redis` |
| Host Ubuntu | `systemd-resolve` ou apenas `999` |

Um bind mount mostra os mesmos números dos dois lados. Se o diretório do host é de `1000:1000` e o processo do container roda como UID `10001`, o acesso é negado, mesmo que o nome `app` exista nos dois lugares. Nome de usuário **não atravessa** a fronteira; só o número.

### Quem é o dono de um volume novo

Com um **volume nomeado**, a regra da aula anterior (o conteúdo da imagem é copiado para um volume vazio) vem com um brinde: o dono e o modo do diretório de montagem da imagem são copiados junto. Se o Dockerfile cria `/data` e faz `chown` para o usuário da aplicação **antes** de a montagem acontecer, o volume nasce com o dono certo. Se o diretório não existe na imagem, o Docker o cria como `root` e o usuário comum não consegue escrever. É o que a saída abaixo mostra, usando o programa Java desta aula:

```text
volume novo, imagem sem chown, processo uid 10001:
processo uid=10001 gid=10001
/data dono uid=0 modo=rwxr-xr-x
SEM permissão de escrita

imagem com "mkdir /data && chown app:app /data", volume novo:
processo uid=10001 gid=10001
/data dono uid=10001 modo=rwxr-xr-x
gravável
```

Num **bind mount** vale o dono do host, e nada é copiado. As saídas possíveis:

1. `docker run --user "$(id -u):$(id -g)"`: o processo roda com o seu número, e ele é o dono do diretório. Boa saída em desenvolvimento.
2. `chown` do diretório do host para o UID da imagem (por exemplo `sudo chown 10001:10001 ./dados`).
3. Um *entrypoint* que começa como root, ajusta o dono do diretório e **troca de usuário** antes de executar a aplicação (o padrão usado pelas imagens oficiais do Postgres e do Redis).
4. `--userns-remap` ou o modo **rootless**: o UID 0 do container vira um UID comum do host, e os donos dos arquivos aparecem deslocados (UID 100000+). Seguro, mas exige entender o mapeamento.

No Docker Desktop, o compartilhamento de arquivos com o host traduz os donos e esconde o problema, que só aparece quando o mesmo Dockerfile roda em um servidor Linux.

### Backup com um container auxiliar

Como o volume é um diretório e você quer acessá-lo sem depender do caminho interno do daemon, use um container descartável que o monta ao lado de um bind mount do host:

```bash
docker run --rm --volumes-from db -v "$PWD:/backup" busybox \
  tar czf /backup/dados.tgz -C /data .

docker volume create dados_novo
docker run --rm -v dados_novo:/data -v "$PWD:/backup" busybox \
  tar xzf /backup/dados.tgz -C /data
```

`--volumes-from db` monta no auxiliar os **mesmos** volumes do container `db`, nos mesmos caminhos. É prático porque você não precisa saber o nome do volume. A forma alternativa, `-v pgdata:/data:ro`, funciona sem nenhum container de origem e protege o dado contra um erro no `tar`. O `-C /data .` entra no diretório antes de empacotar, para que o arquivo não carregue o prefixo `/data/`.

**Consistência.** Copiar os arquivos de um banco em execução é, no melhor caso, um backup *crash-consistent*: equivale ao disco depois de uma queda de energia, e o banco precisa recuperar o próprio WAL ao abrir. Em geral dá certo, mas não há garantia. As opções corretas são parar o container antes do `tar`, usar a ferramenta do banco (`pg_dump`, `pg_basebackup`, `mysqldump`) ou tirar um *snapshot* do volume na camada de armazenamento. Teste sempre a **restauração**: um backup que nunca foi restaurado é uma hipótese.

## Na prática

O programa abaixo é o diagnóstico que você roda dentro do container para ver o UID do processo e o dono do diretório. Em Linux, o atributo `unix:` do `Files` expõe os números:

```java
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;

public class Diagnostico {
    public static void main(String[] args) throws IOException {
        Path dir = Path.of(args.length > 0 ? args[0] : "/data");
        int uid = (Integer) Files.getAttribute(Path.of("/proc/self"), "unix:uid");
        int gid = (Integer) Files.getAttribute(Path.of("/proc/self"), "unix:gid");
        int dono = (Integer) Files.getAttribute(dir, "unix:uid");
        String modo = PosixFilePermissions.toString(Files.getPosixFilePermissions(dir));
        System.out.printf("processo uid=%d gid=%d%n", uid, gid);
        System.out.printf("%s dono uid=%d modo=%s%n", dir, dono, modo);
        System.out.println(Files.isWritable(dir) ? "gravável" : "SEM permissão de escrita");
    }
}
```

E o Dockerfile que faz o volume nascer com o dono certo (a aula 14 aprofunda o `USER`):

```dockerfile
FROM eclipse-temurin:21-jre
RUN useradd --uid 10001 --create-home app \
 && mkdir /data && chown app:app /data
USER 10001
VOLUME /data
COPY app.jar /app/app.jar
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

Para compartilhar um volume entre um escritor e um leitor (um exportador que lê os relatórios da API), monte-o com `:ro` no leitor. Para clonar dados de produção em um ambiente de teste, o mesmo `tar` serve: você pode até ligar os dois com um pipe, sem arquivo intermediário, `docker run --rm -v origem:/from busybox tar cf - -C /from . | docker run --rm -i -v destino:/to busybox tar xf - -C /to`.

## Armadilhas comuns

- **Testar só como root.** Tudo funciona com `root` dentro do container, e o erro de permissão só aparece quando alguém adiciona `USER`. Rode os testes de integração com o usuário final da imagem.
- **`chown` depois do `VOLUME` no Dockerfile.** Alterações no diretório depois da instrução `VOLUME` são descartadas, porque o volume é criado e montado por cima. Faça o `mkdir` e o `chown` antes dela.
- **`chmod 777` para "resolver".** Funciona e abre o dado para qualquer UID do host. Acerte o dono em vez de afrouxar o modo.
- **Copiar `_data` direto do disco do host.** Funciona num servidor Linux, falha em Docker Desktop (o caminho está na VM) e ignora qualquer driver de volume. Passe sempre por um container.
- **Backup de banco sem parar nem usar a ferramenta do banco.** O arquivo existe, mas pode não abrir. E nunca restaurar para testar é o jeito de descobrir isso em um incidente.
- **Guardar o backup no mesmo disco do volume.** Se o disco morre, perde os dois. Envie o `.tgz` para outro lugar (objeto, outro host).

## Checklist de domínio

- [ ] Você explica por que o número do UID, e não o nome, decide o acesso a um arquivo montado
- [ ] Você garante que um volume novo nasça com o dono do usuário da aplicação
- [ ] Você lista as saídas para um bind mount com dono errado e escolhe a adequada
- [ ] Você faz backup e restauração de um volume com `--volumes-from` e `tar`
- [ ] Você explica a diferença entre um backup consistente e um *crash-consistent*

## Para ir além

- [Docker Docs: Back up, restore, or migrate data volumes](https://docs.docker.com/engine/storage/volumes/#back-up-restore-or-migrate-data-volumes)
- [Docker Docs: Isolate containers with a user namespace](https://docs.docker.com/engine/security/userns-remap/)
- [man7.org: user_namespaces(7)](https://man7.org/linux/man-pages/man7/user_namespaces.7.html)
- [PostgreSQL: Backup and Restore](https://www.postgresql.org/docs/current/backup.html)
