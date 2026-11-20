> **Em uma frase:** a imagem é um conjunto de layers endereçáveis por conteúdo; um Dockerfile eficiente é aquele que muda as layers raras com pouca frequência e deixa o runtime sem nada que a aplicação não use.

## O problema

A primeira imagem da `pedidos-api` tem 1,4 GB, leva 9 minutos para buildar e 40 segundos para puxar em cada nó. O Dockerfile parece inocente: parte de uma imagem com JDK completo, copia o projeto inteiro, roda `mvn package` e inicia o jar. A cada correção de vírgula, o Maven baixa todas as dependências de novo. Em produção, o pod demora a subir e o autoscaler reage tarde.

O problema não é "Docker ser lento". É que cada instrução `RUN`, `COPY` e `ADD` cria uma layer, e o cache é invalidado em cascata. Um Dockerfile bom para Java organiza o build em torno do que muda pouco: sistema operacional, dependências, loader e, por último, o código da aplicação.

## Como funciona

Uma imagem é composta por um manifesto, um config JSON e uma pilha de layers. Cada layer é um diff tar endereçável por digest. O runtime faz *overlay* dessas camadas para montar o filesystem raiz do container. Layers são compartilhadas entre imagens: se dez serviços usam `eclipse-temurin:21-jre-jammy`, o host baixa essa base uma vez.

O cache do build funciona por instrução. Enquanto o texto da instrução e o conteúdo dos arquivos copiados não mudarem, o Docker reutiliza a layer. Quando um `COPY` muda, ele e todos os passos seguintes são reconstruídos. Por isso a ordem clássica:

1. copiar `pom.xml` e baixar dependências;
2. copiar `src` e compilar;
3. empacotar o fast-jar com dependências separadas da aplicação;
4. montar o runtime com apenas o JRE e o diretório `quarkus-app`.

O multi-stage permite usar uma imagem pesada de build e descartá-la no resultado final. O estágio `build` tem Maven, JDK, cache e fontes; o estágio final tem JRE, o `quarkus-app` e um usuário sem privilégio. O tamanho que vai para o registry é só o último.

```dockerfile
# syntax=docker/dockerfile:1.7
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /src

# Dependências mudam pouco: ficam em cache enquanto o pom não mudar.
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q dependency:go-offline

COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q package -DskipTests

# O build do Quarkus gera target/quarkus-app com layout de fast-jar.
FROM eclipse-temurin:21-jre-jammy
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home-dir /app app
WORKDIR /app

COPY --from=build /src/target/quarkus-app/lib/ ./lib/
COPY --from=build /src/target/quarkus-app/app/ ./app/
COPY --from=build /src/target/quarkus-app/quarkus/ ./quarkus/
COPY --from=build /src/target/quarkus-app/quarkus-run.jar ./

USER 10001
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+ExitOnOutOfMemoryError", \
            "-jar", "/app/quarkus-run.jar"]
```

O `.dockerignore` é parte do build, não um detalhe:

```text
target/
.git/
.idea/
*.iml
.env
docker-compose*.yml
```

Sem ele, `COPY . .` manda o histórico do Git, o `target` antigo e possivelmente um `.env` para o contexto. Isso aumenta o contexto, invalida cache e pode vazar segredo para a imagem.

O Quarkus não empacota um "fat jar" por padrão: o fast-jar separa `quarkus-run.jar`, `lib/`, `app/` e `quarkus/`. Copiar essas quatro partes juntas é obrigatório — o loader precisa encontrar o diretório `quarkus/` ao lado do jar. Se você usa `quarkus.package.jar.type=uber-jar`, o layout muda e o Dockerfile precisa copiar um único arquivo; não misture os dois modos.

## Na prática

Meça antes de otimizar:

```bash
docker build -t ghcr.io/acme/pedidos-api:1.4.2 .
docker images ghcr.io/acme/pedidos-api:1.4.2
docker history --no-trunc ghcr.io/acme/pedidos-api:1.4.2 | head -20
docker scout cves ghcr.io/acme/pedidos-api:1.4.2
```

`docker history` mostra o tamanho de cada layer; `dive` permite explorar o que entrou e saiu. Uma imagem Quarkus em fast-jar costuma ficar entre 160 e 260 MB com JRE 21 em base Ubuntu. Se passar de 500 MB, quase sempre há JDK completo, cache Maven ou fonte no runtime.

Há um trade-off real entre base e operação:

| Base | Tamanho | Prós | Contras |
|---|---|---|---|
| `eclipse-temurin:21-jre-jammy` | ~250 MB | glibc, ferramentas básicas, debug fácil | superfície maior |
| `eclipse-temurin:21-jre-alpine` | ~180 MB | menor | musl, JNI e DNS podem divergir |
| `gcr.io/distroless/java21-debian12` | ~220 MB | sem shell, menor superfície | difícil investigar em produção |

Distroless é excelente para runtime, mas você perde `sh`, `curl` e `ps`. Se o time não tem observabilidade madura, o custo de diagnóstico pode superar o ganho de segurança. Uma alternativa é manter a base Ubuntu e remover ferramentas de build, rodando como non-root.

Para publicar com procedência e SBOM:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --sbom=true --provenance=mode=max \
  -t ghcr.io/acme/pedidos-api:${GIT_SHA} \
  --push .
```

O SBOM lista dependências e permite responder "esta imagem tem Log4j?" sem rebuild. A procedência mostra qual workflow e commit produziram a imagem. Nenhum dos dois substitui o scan, mas ambos tornam a resposta a incidentes muito mais rápida.

## Armadilhas comuns

- **Copiar o projeto antes de baixar dependências.** Uma mudança em `README.md` invalida a layer do Maven e o build volta a baixar tudo. Copie apenas o `pom.xml` primeiro.
- **Usar `mvn package` sem `-DskipTests` no estágio de imagem.** Testes pertencem ao pipeline; rodá-los de novo no build da imagem duplica tempo e pode exigir banco que não existe ali.
- **Deixar o jar "fat" com dependências duplicadas.** O fast-jar do Quarkus já separa bibliotecas e aplicação; copiar `target/lib` por fora ou usar shade junto com o plugin gera uma imagem maior sem benefício.
- **Rodar como root porque "funciona".** Se a aplicação for comprometida, o atacante herda o UID 0 dentro do container e, dependendo das capabilities, alcança o host. Crie usuário e defina `USER`.
- **Usar `:latest` no deploy.** O nó pode ter uma versão em cache e outro nó baixar outra; o rollout fica não determinístico. Use SHA ou digest.
- **Achar que multi-stage elimina vulnerabilidades da base.** O runtime ainda tem pacotes do sistema. Atualize a base e faça scan regular; imagem menor reduz superfície, não a zera.

## Checklist de domínio

- [ ] Você explica por que a ordem de `COPY` altera o tempo de build
- [ ] Você escreve um Dockerfile multi-stage com usuário non-root e o layout fast-jar do Quarkus
- [ ] Você mede tamanho e CVEs e sabe decidir entre Ubuntu, Alpine e distroless
- [ ] Você identifica o que está inflando uma imagem de 1 GB

## Para ir além

- [Docker Docs — Building best practices](https://docs.docker.com/build/building/best-practices/)
- [Quarkus — Container images](https://quarkus.io/guides/container-image)
- [Docker Docs — Build cache](https://docs.docker.com/build/cache/)
