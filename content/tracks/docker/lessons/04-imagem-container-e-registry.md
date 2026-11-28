> **Em uma frase:** a imagem é um pacote imutável (manifesto, config e camadas endereçadas por digest) guardado em um registry; o container é uma execução dessa imagem com uma camada gravável por cima, e o `pull`, o `tag` e o `push` só movem o que o destino ainda não tem.

## O problema

O time diz "sobe a versão 1.27 do nginx" e três pessoas entendem coisas diferentes: uma baixa a imagem, outra cria um container, uma terceira edita um arquivo dentro de um container em execução e acha que "mudou a versão". Semanas depois, o deploy de produção puxa `loja/api:latest` e traz um binário diferente do que passou nos testes, porque alguém publicou outra imagem com a mesma tag.

Quase todo mal-entendido sobre Docker nasce da confusão entre **imagem**, **container** e **registry**, e da ideia de que uma tag identifica um conteúdo. Esta aula separa os três conceitos e mostra qual deles é imutável.

## Como funciona

**Registry** é um servidor HTTP que guarda e serve imagens (Docker Hub, GHCR, Amazon ECR, Harbor). O protocolo é a *distribution spec* da OCI. O nome completo de uma imagem tem quatro partes: `registry/repositório:tag`, e opcionalmente `@digest`. Quando você omite o registry, o Docker assume `docker.io`, e quando omite o namespace de uma imagem oficial, assume `library`. Portanto `nginx:1.27` é `docker.io/library/nginx:1.27`.

**Imagem** é composta de três tipos de objeto:

- as **camadas**: arquivos tar comprimidos, cada um com as mudanças de uma instrução do Dockerfile (aula 5);
- a **config**: um JSON com o `ENTRYPOINT`, o `CMD`, as variáveis de ambiente, a arquitetura e a lista das camadas;
- o **manifesto**: um JSON que lista a config e as camadas, cada uma pelo seu **digest**.

O digest é o `sha256` do conteúdo (`sha256:daa3…`). Por isso a imagem é **endereçada por conteúdo**: mudar um byte muda o digest da camada, o da config e o do manifesto. Um digest identifica sempre os mesmos bytes, e o Docker verifica o hash depois de baixar. Já a **tag** (`1.27`, `latest`) é um apontador que o dono do repositório pode mover para outro manifesto a qualquer momento.

Para servir várias plataformas com o mesmo nome, a tag aponta para um **índice** (*image index*, antes chamado de *manifest list*). O índice lista um manifesto por plataforma (`linux/amd64`, `linux/arm64`, ...), e o `docker pull` escolhe o que combina com o host. `docker buildx imagetools inspect nginx:1.27` mostra o índice.

**Container** é uma execução: o Docker não copia a imagem, ele reutiliza as camadas (somente leitura) e acrescenta uma **camada gravável** só do container. Cem containers da mesma imagem compartilham as mesmas camadas no disco. Apagar o container apaga a camada gravável; a imagem permanece.

**pull, tag e push.** `docker pull` baixa o manifesto e só as camadas que faltam localmente. `docker tag origem destino` cria **outro nome** para a mesma imagem, sem copiar bytes. `docker push` envia as camadas que o registry ainda não tem (as outras aparecem como `Layer already exists`) e, por último, o manifesto.

## Na prática

```bash
docker pull nginx:1.27
docker images --digests nginx
docker buildx imagetools inspect nginx:1.27

docker run -d --name web1 nginx:1.27
docker run -d --name web2 nginx:1.27
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker rm -f web1

docker tag nginx:1.27 registry.exemplo.com/loja/nginx:1.27
docker push registry.exemplo.com/loja/nginx:1.27
docker system df
```

O `docker images --digests` mostra o digest que o registry devolveu; é ele que você grava no deploy quando precisa de uma versão que ninguém consiga mover (`image: nginx@sha256:...`). O `docker system df` mostra o espaço de imagens, containers e volumes, e `docker image prune` remove as imagens sem tag (*dangling*).

Para sentir por que o endereçamento por conteúdo funciona, o programa Java abaixo calcula digests com SHA-256: a mudança de **um caractere** muda o digest inteiro, e o digest da config e o do manifesto dependem dos digests das camadas:

```java
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

public class Digest {
    public static void main(String[] args) throws Exception {
        byte[] camada = "conteúdo do tar da camada /app/app.jar".getBytes(StandardCharsets.UTF_8);
        String digestCamada = sha256(camada);
        System.out.println("camada          " + digestCamada);

        // um único caractere diferente produz um digest completamente diferente
        byte[] outra = "conteúdo do tar da camada /app/app.jaR".getBytes(StandardCharsets.UTF_8);
        System.out.println("camada alterada " + sha256(outra));

        // a config cita as camadas pelo digest; o manifesto cita a config e as camadas
        String config = "{\"architecture\":\"amd64\",\"rootfs\":{\"diff_ids\":[\"" + digestCamada + "\"]}}";
        String digestConfig = sha256(config.getBytes(StandardCharsets.UTF_8));
        String manifesto = "{\"config\":{\"digest\":\"" + digestConfig + "\"},\"layers\":[{\"digest\":\"" + digestCamada + "\"}]}";
        System.out.println("config          " + digestConfig);
        System.out.println("manifesto       " + sha256(manifesto.getBytes(StandardCharsets.UTF_8)));
    }

    static String sha256(byte[] conteudo) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(conteudo);
        return "sha256:" + HexFormat.of().formatHex(hash);
    }
}
```

É uma simplificação: no formato real da OCI, o `diff_ids` da config traz o digest da camada **descompactada**, e o manifesto traz o da camada **compactada** (o blob que viaja pela rede). A ideia, porém, é a mesma: cada objeto cita os outros pelo hash.

## Armadilhas comuns

- **Usar `latest` em produção.** Ela não é "a mais recente": é só uma tag como outra qualquer, que o autor move. Faça deploy por **versão** e, para imutabilidade total, por **digest**.
- **Editar um container em execução e esperar que isso vire imagem.** A mudança fica na camada gravável e some no `docker rm`. Mudanças duráveis entram no Dockerfile e geram uma imagem nova (`docker commit` existe, mas é um atalho de depuração).
- **Confundir `docker rm` com `docker rmi`.** O primeiro remove o container, o segundo a imagem, e só funciona quando nenhum container (nem parado) a usa.
- **Ignorar a arquitetura.** Uma imagem só `amd64` falha em nós `arm64` com `exec format error`. Publique um índice multi-arquitetura quando os ambientes forem mistos.
- **Deixar o disco encher de imagens antigas.** Servidores de build e de deploy acumulam camadas. Faça `docker image prune` e `docker system df` parte da rotina, e lembre que registries públicos limitam os pulls anônimos.

## Checklist de domínio

- [ ] Você diferencia imagem, container e registry e nomeia o que cada um guarda
- [ ] Você lê um nome completo de imagem (registry, repositório, tag e digest)
- [ ] Você explica por que o digest é imutável e a tag não
- [ ] Você sabe o que o índice multi-arquitetura resolve
- [ ] Você descreve o que `docker tag` e `docker push` realmente transmitem

## Para ir além

- [O que é uma imagem](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-an-image/)
- [O que é um registry](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-registry/)
- [Imagens multi-plataforma](https://docs.docker.com/build/building/multi-platform/)
- [OCI image-spec](https://specs.opencontainers.org/image-spec/)
- [OCI distribution-spec](https://specs.opencontainers.org/distribution-spec/)
