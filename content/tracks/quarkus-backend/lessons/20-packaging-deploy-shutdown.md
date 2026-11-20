> **Em uma frase:** o build do Quarkus já separa o que muda do que não muda; o deploy precisa separar o que pode ser interrompido do que ainda está em voo — e é o graceful shutdown que faz essa ponte.

## O problema

O rollout começa. O Kubernetes envia `SIGTERM`, o processo morre em menos de um segundo e os clientes recebem `502` por alguns segundos. O time adiciona `sleep 30` no `preStop`; o 502 some, mas o deploy passa a demorar e, quando uma requisição longa está no meio, ela ainda é cortada. Ninguém sabe se o problema é o probe, o tempo de drenagem ou o balanceador.

Em paralelo, a imagem passa de 600 MB. O time tenta native para reduzir memória e startup; o build falha porque uma biblioteca usa reflection sem registro. Quando finalmente funciona, uma chamada de serialização começa a retornar `null` e o debug, que era um breakpoint, vira leitura de log de build.

Empacotar bem é decidir três coisas: o que vai no artefato, como a imagem é montada em camadas e como o processo termina. O Quarkus ajuda nas três, mas cada escolha tem custo. Fast-jar não é “jar gordo”; native não é automaticamente mais rápido; graceful shutdown não é só `sleep`.

## Como funciona

**Fast-jar.** É o formato padrão. O build gera `target/quarkus-app/` com:

```text
target/quarkus-app/
├── quarkus-run.jar      # entrypoint pequeno
├── app/                 # suas classes e recursos
├── lib/
│   ├── boot/            # bootstrap do Quarkus
│   └── main/            # dependências da aplicação
└── quarkus/             # metadados gerados em build time
```

O `quarkus-run.jar` não é um jar único; ele referencia as camadas. Isso melhora o startup, porque o Quarkus já resolveu muito do grafo em build time, e melhora o cache de imagem: dependências mudam menos que o código. O comando é:

```bash
java -jar target/quarkus-app/quarkus-run.jar
```

**Outros formatos.** `quarkus.package.jar.type=uber-jar` produz um jar único, mais simples de copiar, mas pior para camadas e startup. `legacy-jar` existe por compatibilidade. Native não é um tipo de jar: é um build GraalVM/Mandrel que gera um binário.

**JVM ou native.** A comparação honesta:

| Critério | JVM (fast-jar) | Native |
|---|---|---|
| Startup | Centenas de ms a segundos | Dezenas de ms |
| Memória ociosa | Maior (JIT, metaspace) | Menor |
| Build | Segundos/minutos | Minutos, exige GraalVM/Mandrel |
| Throughput de pico | JIT pode superar após aquecimento | Bom, mas nem sempre maior |
| Reflection/serialização | Funciona sem configurar | Exige registro ou extensão |
| Debug | JVM normal | Mais difícil |
| Caso ideal | Serviço longo, carga constante, ecossistema complexo | Scale-to-zero, muitos pods, startup crítico |

Native brilha quando o custo dominante é subir rápido e ocupar pouca memória. Para um serviço que roda 24/7 com carga alta e usa bibliotecas dinâmicas, a JVM costuma ser mais simples e às vezes mais rápida no pico. Meça com a sua carga; não escolha por benchmark genérico.

**Imagem em camadas.** O Dockerfile deve copiar primeiro o que muda pouco e depois o que muda muito:

```dockerfile
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY . .
RUN ./mvnw -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /work
COPY --from=build --chown=1001:1001 /src/target/quarkus-app/lib/ /work/lib/
COPY --from=build --chown=1001:1001 /src/target/quarkus-app/*.jar /work/
COPY --from=build --chown=1001:1001 /src/target/quarkus-app/app/ /work/app/
COPY --from=build --chown=1001:1001 /src/target/quarkus-app/quarkus/ /work/quarkus/
USER 1001
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-XX:+ExitOnOutOfMemoryError", "-jar", "/work/quarkus-run.jar"]
```

O `quarkus-container-image-jib` faz esse cache automaticamente e não exige Docker para push:

```properties
quarkus.container-image.build=true
quarkus.container-image.push=true
quarkus.container-image.registry=registry.exemplo.com
quarkus.container-image.group=exemplo
quarkus.container-image.name=pedidos-api
quarkus.container-image.tag=${quarkus.application.version}
```

Jib é bom para CI sem daemon; Dockerfile é bom quando você precisa de controle fino do sistema base. Nos dois casos, rode como não-root, fixe a imagem base por digest e mantenha o artefato pequeno.

**Graceful shutdown.** Por padrão, o Quarkus encerra sem esperar requisições em voo. Você liga a drenagem com:

```properties
quarkus.shutdown.timeout=20s
```

Com isso, ao receber `SIGTERM`, o Quarkus para de aceitar novas conexões e espera as requisições HTTP em andamento até 20 segundos. Se o cliente ainda estiver lendo um stream, o tempo pode estourar; requests longos precisam de timeout próprio e cancelamento.

Existe uma corrida entre o `SIGTERM` e a remoção do pod do balanceador. O Kubernetes pode enviar tráfego por alguns instantes depois do sinal. Para cobrir isso, o Quarkus oferece o **shutdown delay**:

```properties
quarkus.shutdown.delay-enabled=true
quarkus.shutdown.delay=10s
```

`delay-enabled` é build time; `delay` é runtime. Durante o delay, a aplicação continua respondendo, mas o readiness passa a falhar. O balanceador remove o pod enquanto ele ainda serve; só depois começa a drenagem. É mais preciso que `preStop: sleep`, porque o sleep mantém o readiness verde e não avisa ninguém.

A conta do Kubernetes:

```text
terminationGracePeriodSeconds > preStop + shutdown.delay + shutdown.timeout + margem
```

Com `preStop=5s`, `delay=10s`, `timeout=20s` e margem de 5s, use pelo menos 40s. Se você usa o delay do Quarkus, pode dispensar o `preStop` e reduzir a conta.

```yaml
spec:
  terminationGracePeriodSeconds: 40
  containers:
    - name: pedidos
      image: registry.exemplo.com/exemplo/pedidos-api:1.0.0
      ports:
        - containerPort: 8080
      readinessProbe:
        httpGet:
          path: /q/health/ready
          port: 8080
        periodSeconds: 5
        failureThreshold: 2
      livenessProbe:
        httpGet:
          path: /q/health/live
          port: 8080
        periodSeconds: 10
        failureThreshold: 3
      startupProbe:
        httpGet:
          path: /q/health/started
          port: 8080
        periodSeconds: 2
        failureThreshold: 30
      lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 5"]
      resources:
        requests:
          cpu: 250m
          memory: 256Mi
        limits:
          memory: 512Mi
```

`MaxRAMPercentage=75` com limite de 512Mi deixa cerca de 384Mi para heap; o resto é metaspace, código, threads e buffers. Se o container for morto por OOMKilled, ajuste o limite ou a porcentagem, não apenas o `-Xmx`.

**Shutdown de recursos.** Feche clients, flushe métricas e pare consumidores no evento de shutdown. Para HTTP, o Quarkus já drenou antes; para mensageria, a história é outra: o graceful shutdown do Quarkus cobre HTTP, não garante que consumidores Kafka terminaram. Pare o consumo, faça commit do offset processado e só então encerre.

## Na prática

O fluxo de build e execução local:

```bash
./mvnw clean package
java -jar target/quarkus-app/quarkus-run.jar

# imagem
./mvnw package -Dquarkus.container-image.build=true

# native local (GraalVM/Mandrel instalado)
./mvnw package -Dnative

# native em container, sem GraalVM na máquina
./mvnw package -Dnative -Dquarkus.native.container-build=true
```

O binário nativo fica em `target/*-runner`. Teste o artefato empacotado, não só o modo dev:

```java
@QuarkusIntegrationTest
class AplicacaoIT {

    @Test
    void healthProntoResponde() {
        given().when().get("/q/health/ready").then().statusCode(200);
    }
}
```

Para native, o build pode precisar de registro de reflection e recursos:

```java
import io.quarkus.runtime.annotations.RegisterForReflection;

@RegisterForReflection(targets = { PedidoLegado.class, RespostaSoap.class })
public class ConfiguracaoNative {
}
```

Só registre o que a biblioteca realmente usa em runtime. Reflection demais aumenta a imagem e o tempo de build; reflection de menos falha em produção com `ClassNotFoundException` ou campo `null`. O teste de integração nativo é o que pega isso antes do deploy.

Um pipeline mínimo:

1. `./mvnw verify` — testes JVM.
2. `./mvnw package -Dnative -Dquarkus.native.container-build=true` — binário.
3. `./mvnw verify -Dnative` — testes de integração contra o binário.
4. `docker build` ou Jib — imagem.
5. Scan de vulnerabilidade e SBOM.
6. Assinatura e deploy com `maxUnavailable=0`, `maxSurge=1`, readiness e PDB.

Native não elimina a necessidade de probe: o processo pode travar, a dependência pode cair e o pod precisa sair do balanceador. O startup é mais rápido, mas readiness e liveness continuam valendo.

## Armadilhas comuns

- **`sleep` no `preStop` como única drenagem.** Mantém o readiness verde e não garante que requisições terminaram. Use `quarkus.shutdown.timeout` e, se necessário, o delay.
- **Grace period menor que a soma.** O Kubernetes mata o processo no meio da drenagem. Calcule `preStop + delay + timeout + margem`.
- **Liveness agressivo em startup.** A JVM demora, o probe falha e o pod reinicia em loop. Use `startupProbe`.
- **Imagem rodando como root.** Um comprometimento ganha o container inteiro. Crie usuário e use `USER`.
- **Base image sem pin.** `latest` muda sem aviso e quebra o build. Fixe tag e, idealmente, digest.
- **Native sem teste de integração.** O build passa, mas reflection, serialização ou SSL falham no primeiro request.
- **Native por moda.** Build lento, debug difícil e throughput às vezes menor. Compare com a carga real.
- **`-Xmx` fixo ignorando o limite.** O container é OOMKilled ou desperdiça memória. Use `MaxRAMPercentage` e valide com métricas.
- **Migrations em todas as réplicas ao mesmo tempo.** O Flyway usa lock, mas o boot fica lento e o rollout pode falhar. Prefira job/init container ou uma réplica migradora.
- **Mensageria sem shutdown próprio.** O Quarkus drena HTTP, não garante commit de Kafka. Pare o consumo e finalize o processamento antes de sair.
- **Health check com detalhe sensível.** O endpoint é acessível no cluster; não exponha string de conexão, versão de biblioteca ou stack trace.

## Checklist de domínio

- [ ] Você entende a estrutura do fast-jar e por que ela melhora startup e cache de camadas
- [ ] Você escolhe JVM ou native com base em startup, memória, throughput e complexidade
- [ ] Você monta uma imagem não-root, pequena e com camadas estáveis
- [ ] Você configura `quarkus.shutdown.timeout` e sabe o que ele cobre
- [ ] Você usa `quarkus.shutdown.delay` para falhar readiness antes da drenagem
- [ ] Você calcula `terminationGracePeriodSeconds` incluindo preStop, delay e timeout
- [ ] Você testa o artefato empacotado e o nativo com `@QuarkusIntegrationTest`
- [ ] Você trata shutdown de consumidores e recursos além do HTTP

## Para ir além

- [Quarkus — Packaging](https://quarkus.io/guides/packaging)
- [Quarkus — Container Images](https://quarkus.io/guides/container-image)
- [Quarkus — Application Lifecycle and Graceful Shutdown](https://quarkus.io/guides/lifecycle)
- [Quarkus — Building Native Images](https://quarkus.io/guides/building-native-image)
- [Kubernetes — Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
