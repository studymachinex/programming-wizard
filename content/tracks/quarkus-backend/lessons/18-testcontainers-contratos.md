> **Em uma frase:** Testcontainers dá um banco real e efêmero; contract tests dizem se a sua mudança quebra o consumidor — e nenhum dos dois substitui o outro.

## O problema

O teste de repositório usa H2 porque “é mais rápido”. Em produção, o PostgreSQL rejeita a query: `ON CONFLICT` funciona, mas a função `date_trunc` com timezone se comporta diferente, a constraint `unique` tem outro nome e o locking não é o mesmo. O teste passou; o deploy quebrou. O time troca H2 por um banco compartilhado de homologação, e agora os testes dependem de dados de outras pessoas, falham em paralelo e ninguém sabe quem apagou a tabela.

O outro buraco aparece entre times. O serviço de relatórios consome `/api/pedidos` e espera o campo `status` como string. A API muda `status` para um objeto `{codigo, descricao}`; os testes do provedor passam, o consumidor quebra em produção. Nenhum teste unitário pega isso porque o contrato não estava escrito em lugar nenhum.

Testcontainers resolve o primeiro problema: banco real, versão controlada, ciclo de vida isolado. Contract tests resolvem o segundo: a expectativa do consumidor vira um artefato verificável. Juntos, eles dão confiança para mudar schema e contrato sem descobrir no incidente.

## Como funciona

**Testcontainers.** A biblioteca sobe um container Docker a partir de uma imagem, espera ficar pronto e expõe portas e credenciais. `PostgreSQLContainer` já configura banco, usuário e senha, e o driver recebe a URL mapeada. No fim, o container é removido; o Ryuk garante a limpeza mesmo se a JVM morrer.

No Quarkus, o jeito recomendado é um `QuarkusTestResourceLifecycleManager`: ele inicia o container **antes** da aplicação Quarkus e devolve as propriedades de conexão. Isso importa porque o datasource e o Flyway são criados no boot; uma extensão JUnit que sobe o container depois não serve.

```java
public class PostgresResource implements QuarkusTestResourceLifecycleManager {

    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("pedidos")
                    .withUsername("pedidos")
                    .withPassword("pedidos");

    @Override
    public Map<String, String> start() {
        POSTGRES.start();
        return Map.of(
                "quarkus.datasource.jdbc.url", POSTGRES.getJdbcUrl(),
                "quarkus.datasource.username", POSTGRES.getUsername(),
                "quarkus.datasource.password", POSTGRES.getPassword());
    }

    @Override
    public void stop() {
        POSTGRES.stop();
    }
}
```

O teste declara o recurso:

```java
@QuarkusTest
@QuarkusTestResource(PostgresResource.class)
class PedidoRepositoryTest {
    // ...
}
```

O recurso é global por padrão: todas as classes compartilham o mesmo container e o mesmo banco. Use `restrictToAnnotatedClass = true` quando o container precisa de configuração específica, sabendo que isso cria outro contexto e outro boot.

**Dev Services ou Testcontainers?** Para PostgreSQL, Redis, Kafka e outros serviços suportados, o Dev Services já sobe o container quando não há URL configurada. É menos código e integra com o ciclo de vida do Quarkus. Use Testcontainers quando precisar de imagem, versão, rede, variáveis ou um serviço que o Dev Services não cobre, ou quando o teste precisar falar diretamente com o container. Os dois usam Docker; não são alternativas conceituais, são níveis de controle.

**Reuso e CI.** Subir PostgreSQL leva alguns segundos. Em desenvolvimento, `withReuse(true)` e `testcontainers.reuse.enable=true` em `~/.testcontainers.properties` mantêm o container entre execuções. No CI, prefira container novo: reuso esconde estado e mascara problema de inicialização. Se o CI não tem Docker, o teste deve falhar explicitamente, não cair para H2.

**Contract tests.** No modelo consumer-driven, o consumidor descreve a requisição que faz e a resposta que espera. O Pact gera um contrato JSON. O provedor verifica esse contrato contra a implementação real. Se o provedor quebrar o que o consumidor usa, a verificação falha antes do deploy.

Um teste de consumidor com Pact:

```java
package com.exemplo.relatorios;

import au.com.dius.pact.consumer.MockServer;
import au.com.dius.pact.consumer.dsl.PactDslJsonArray;
import au.com.dius.pact.consumer.dsl.PactDslWithProvider;
import au.com.dius.pact.consumer.junit5.PactConsumerTestExt;
import au.com.dius.pact.consumer.junit5.PactTestFor;
import au.com.dius.pact.core.model.RequestResponsePact;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import static org.junit.jupiter.api.Assertions.assertEquals;

@ExtendWith(PactConsumerTestExt.class)
@PactTestFor(providerName = "pedidos-api")
class PedidoClientContractTest {

    @Pact(consumer = "relatorios")
    RequestResponsePact listarPedidos(PactDslWithProvider builder) {
        return builder
                .given("existe um pedido criado")
                .uponReceiving("uma listagem de pedidos")
                .path("/api/pedidos")
                .method("GET")
                .willRespondWith()
                .status(200)
                .headers(Map.of("Content-Type", "application/json"))
                .body(new PactDslJsonArray()
                        .object()
                        .integerType("id", 1)
                        .stringType("status", "CRIADO")
                        .closeObject())
                .toPact();
    }

    @Test
    @PactTestFor(pactMethod = "listarPedidos")
    void consomeListagem(MockServer mockServer) {
        var client = new PedidoClient(mockServer.getUrl());
        var pedidos = client.listar();
        assertEquals(1, pedidos.size());
        assertEquals("CRIADO", pedidos.get(0).status());
    }
}
```

O provedor verifica o contrato publicado no broker:

```java
package com.exemplo.pedidos;

import au.com.dius.pact.provider.junit5.HttpTestTarget;
import au.com.dius.pact.provider.junit5.PactVerificationContext;
import au.com.dius.pact.provider.junit5.PactVerificationInvocationContextProvider;
import au.com.dius.pact.provider.junitsupport.Provider;
import au.com.dius.pact.provider.junitsupport.loader.PactBroker;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.TestTemplate;
import org.junit.jupiter.api.extension.ExtendWith;

@Provider("pedidos-api")
@PactBroker(url = "${PACT_BROKER_URL}")
class PedidoProviderContractTest {

    @BeforeEach
    void alvo(PactVerificationContext context) {
        context.setTarget(new HttpTestTarget("localhost", 8081));
    }

    @TestTemplate
    @ExtendWith(PactVerificationInvocationContextProvider.class)
    void verificaContrato(PactVerificationContext context) {
        context.verifyInteraction();
    }
}
```

O provedor sobe com o banco real e o estado “existe um pedido criado” precisa ser preparado. Pact usa *provider states*: o teste do provedor registra um handler que cria os dados antes da interação. Sem isso, a verificação falha por 404 e você culpa o contrato.

**Contrato versus OpenAPI.** OpenAPI descreve o formato que você publica; um diff de schema pega campo removido, tipo alterado e status novo. Contract test pega o que um consumidor específico realmente usa. Os dois se complementam: OpenAPI é a documentação e o gate de compatibilidade; Pact é a voz do consumidor.

## Na prática

Um fluxo completo com Testcontainers e Migrations:

```java
@QuarkusTest
@QuarkusTestResource(PostgresResource.class)
class TransferenciaRepositoryTest {

    @Inject
    TransferenciaService service;

    @Test
    @TestTransaction
    void debitaEDepositaNaMesmaTransacao() {
        var origem = Conta.criar(new BigDecimal("100.00"));
        var destino = Conta.criar(new BigDecimal("0.00"));

        service.transferir(origem.id, destino.id, new BigDecimal("30.00"));

        assertEquals(new BigDecimal("70.00"), Conta.findById(origem.id).saldo);
        assertEquals(new BigDecimal("30.00"), Conta.findById(destino.id).saldo);
    }
}
```

O Flyway roda no boot do Quarkus e cria o schema no container. O teste não precisa de `schema.sql` paralelo; se a migration quebrar, o contexto não sobe e o erro aparece cedo.

Para um serviço externo que não é banco, o mesmo padrão vale: um `QuarkusTestResourceLifecycleManager` sobe o WireMock, retorna a URL e o teste configura o cliente. O importante é que o recurso comece antes do Quarkus e que o `stop()` seja idempotente.

No CI, o gate de contrato pode ser:

```bash
./mvnw verify
pact-broker can-i-deploy --pacticipant pedidos-api --latest --to-environment production
```

`can-i-deploy` consulta o broker e responde se aquela versão do provedor é compatível com os consumidores que já estão em produção. É a diferença entre “meus testes passaram” e “posso fazer deploy sem quebrar quem me consome”.

## Armadilhas comuns

- **Container por teste.** Subir PostgreSQL em cada método mata a suíte. O container é por JVM/classe; o estado é limpo por teste.
- **Reuso no CI.** `withReuse(true)` acelera localmente, mas esconde schema antigo e dados presos. No CI, container novo.
- **Sem wait strategy.** O teste conecta antes de o banco aceitar conexões e falha de forma intermitente. Use a espera padrão do `PostgreSQLContainer` ou uma estratégia explícita.
- **H2 como substituto.** H2 mente sobre funções, tipos, constraints e locking. Se o risco é SQL, use o banco real.
- **Recurso global inesperado.** `@QuarkusTestResource` sem `restrictToAnnotatedClass` vale para a suíte inteira. Um container de Kafka pode ser caro em testes que não o usam.
- **Contract test acoplado à implementação.** O contrato deve descrever request/response observável, não classes internas, ordem de campos ou logs.
- **Provider state esquecido.** A verificação falha porque o dado não existe. O estado precisa ser criado antes de cada interação.
- **Contrato não verificado no CI.** Gerar o Pact e nunca rodar a verificação é documentação morta. Coloque `can-i-deploy` no pipeline.
- **Flakiness por tempo.** `Thread.sleep`, timeout curto e relógio real produzem falhas intermitentes. Injete `Clock`, use `Awaitility` com limite e prefira eventos a sleeps.

## Checklist de domínio

- [ ] Você usa Testcontainers com o mesmo banco e versão de produção
- [ ] Você entende por que o recurso sobe antes do Quarkus e como o `stop()` limpa
- [ ] Você diferencia Dev Services de Testcontainers e escolhe pelo controle necessário
- [ ] Você evita reuso no CI e sabe diagnosticar container que não sobe
- [ ] Você escreve um contract test que descreve o que o consumidor usa, não a implementação
- [ ] Você configura provider states e verifica o contrato no pipeline
- [ ] Você usa `can-i-deploy` ou equivalente para autorizar o deploy

## Para ir além

- [Quarkus — Testcontainers](https://quarkus.io/guides/testcontainers)
- [Testcontainers — PostgreSQL Module](https://testcontainers.com/modules/postgresql/)
- [Pact — Consumer-Driven Contract Testing](https://docs.pact.io/)
- [Pact JVM](https://docs.pact.io/implementation_guides/jvm/readme)
