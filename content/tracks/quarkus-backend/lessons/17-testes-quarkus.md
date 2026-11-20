> **Em uma frase:** o teste que dá confiança é o menor teste que ainda exercita a integração real — e no Quarkus isso significa escolher entre `new`, `@QuarkusTest` e `@QuarkusIntegrationTest`, não subir o mundo para toda regra.

## O problema

A suíte começa com um teste de resource que sobe a aplicação, um banco e um broker. Ele passa. Depois vira hábito: toda validação de CPF, todo cálculo de frete e toda regra de desconto entram no mesmo `@QuarkusTest`. A suíte chega a vinte minutos, ninguém roda antes do commit e o CI vira loteria. Quando um teste falha, o diagnóstico é “o contexto não subiu” ou “o dado de outro teste ficou no banco”.

O outro extremo é a suíte de mocks: tudo é `Mockito`, o banco nunca é exercitado, e o teste passa enquanto a query real quebra em produção porque o dialeto não suporta a função. Teste bom não é o que usa a ferramenta mais pesada; é o que falha quando o comportamento relevante quebra, com o menor custo possível.

A pirâmide aplicada ao Quarkus tem três andares: teste puro com `new` para regra e cálculo; `@QuarkusTest` para fiação CDI, HTTP, persistência e segurança; `@QuarkusIntegrationTest` para o artefato empacotado, incluindo native. Dev Services e Testcontainers entram no segundo andar quando a dependência precisa ser real.

## Como funciona

**Teste puro.** Uma classe sem anotações, instanciada com `new`, roda em milissegundos. Se a regra depende de `Clock`, gere um `Clock.fixed`; se depende de um gateway, use uma implementação em memória. Esse é o lugar para calcular frete, aplicar cupom, validar transição de estado e testar casos de borda. O container não acrescenta nada.

**`@QuarkusTest`.** O JUnit inicia a aplicação uma vez por configuração e injeta beans no teste. O teste é um bean CDI: `@Inject` funciona, `@Transactional` funciona, `@InjectMock` substitui beans de escopo normal. REST Assured recebe a URL e a porta de teste (8081 por padrão), então você não configura host. `@TestHTTPEndpoint(PedidoResource.class)` evita repetir o path.

O contexto é compartilhado entre classes com a mesma configuração. Isso é o que torna a suíte rápida — e o que espalha estado. Um teste que grava no banco deixa dados para o próximo, a menos que você limpe ou use `@TestTransaction`.

**Transações em teste.** `@Transactional` no método de teste abre uma transação e a **commita** no fim. Para reverter, use `@TestTransaction`: ele abre a transação e faz rollback ao terminar. Isso funciona bem quando o teste chama um bean diretamente. Em teste HTTP, a requisição roda em outra thread e pode não participar da transação do teste; nesse caso, limpe os dados explicitamente ou use identificadores únicos por teste.

**Dev Services.** Se a extensão de banco está no classpath e não há URL configurada, o Quarkus sobe um container PostgreSQL, injeta a configuração e derruba no fim. É o caminho padrão para `@QuarkusTest` local e no CI com Docker. Você não escreve Testcontainers para o caso comum. Para fixar a imagem:

```properties
%test.quarkus.datasource.db-kind=postgresql
%test.quarkus.datasource.devservices.image-name=postgres:16-alpine
```

Se o CI oferece um banco como serviço, configure a URL e desligue o Dev Services com `quarkus.datasource.devservices.enabled=false`. Sem Docker e sem URL, o teste falha — melhor do que cair silenciosamente em H2 e mentir sobre o dialeto.

**`@TestProfile`.** Um perfil troca configuração e alternativas e força o reinício do contexto. Use para cenários que realmente mudam a configuração — horário fixo, feature flag, cliente fake. Cada perfil extra custa um boot; não crie um por teste.

**`@QuarkusIntegrationTest`.** Roda contra o artefato empacotado (jar, container ou nativo), em outro processo. Não há injeção de beans nem `@InjectMock`; o teste fala HTTP com a aplicação real. É o lugar para validar empacotamento, configuração de produção e comportamento nativo. Ele é mais lento e deve ser seletivo.

**Mock certo.** `@InjectMock` substitui um bean CDI normal. Para `@RestClient`, a interface precisa ser `@ApplicationScoped` para ter escopo normal. Mock de bean usado durante o startup não funciona; para isso, use `@Alternative @Priority`. E não mocke o que você quer testar: se o teste é da query, o banco precisa ser real.

## Na prática

Comece pela regra pura:

```java
class FreteTest {

    @Test
    void freteGratisAcimaDeDuzentos() {
        var calculadora = new CalculadoraFrete();
        assertEquals(BigDecimal.ZERO, calculadora.calcular(new BigDecimal("250.00")));
    }

    @Test
    void cobraDezPorCentoAbaixoDoMinimo() {
        var calculadora = new CalculadoraFrete();
        assertEquals(new BigDecimal("18.00"), calculadora.calcular(new BigDecimal("180.00")));
    }
}
```

O teste de aplicação exercita HTTP, validação e persistência no banco real:

```java
package com.exemplo.pedidos;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.TestTransaction;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

@QuarkusTest
class PedidoResourceTest {

    @Inject
    PedidoService service;

    @BeforeEach
    @Transactional
    void limpar() {
        Pedido.deleteAll();
    }

    @Test
    void criaPedidoViaHttp() {
        given()
                .contentType("application/json")
                .body("""
                        {"clienteId":1,"itens":[{"sku":"livro","quantidade":2,"preco":39.90}]}
                        """)
                .when().post("/api/pedidos")
                .then()
                .statusCode(201)
                .header("Location", notNullValue())
                .body("total", equalTo(79.80f));
    }

    @Test
    @TestTransaction
    void calculaTotalNoService() {
        var pedido = service.criar(1L, java.util.List.of(
                new Item("livro", 2, new BigDecimal("39.90"))));
        assertEquals(new BigDecimal("79.80"), pedido.total);
    }
}
```

`limpar` usa `@Transactional` porque o `deleteAll` precisa de transação e deve commitar a limpeza. Já `@TestTransaction` no segundo teste reverte o que o service gravou; ele não envolve a requisição HTTP do primeiro teste.

Para isolar uma dependência externa, mocke o cliente REST e verifique o caminho de fallback:

```java
@QuarkusTest
class EstoqueResourceTest {

    @InjectMock
    @RestClient
    EstoqueClient estoque;

    @Test
    void usaEstoqueIndisponivelQuandoClienteFalha() {
        when(estoque.consultar(anyLong())).thenThrow(new RuntimeException("timeout"));

        given().when().get("/api/produtos/1")
                .then().statusCode(200)
                .body("disponivel", equalTo(false));
    }
}
```

Um perfil troca configuração sem duplicar `application.properties`:

```java
@QuarkusTest
@TestProfile(LojaFechadaTest.LojaFechada.class)
class LojaFechadaTest {

    @Test
    void recusaPedidoForaDoHorario() {
        given().when().post("/api/pedidos")
                .then().statusCode(422);
    }

    public static class LojaFechada implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of("app.loja.abertura", "23:59", "app.loja.fechamento", "23:59");
        }
    }
}
```

O teste de integração fica separado e não injeta nada:

```java
@QuarkusIntegrationTest
class PedidoIT {

    @Test
    void aplicacaoEmpacotadaResponde() {
        given().when().get("/q/health/ready").then().statusCode(200);
    }
}
```

## Armadilhas comuns

- **Subir `@QuarkusTest` para tudo.** Regra pura no container custa segundos e esconde acoplamento. Use `new` quando não há CDI, HTTP ou banco no caminho.
- **Achar que `@Transactional` no teste faz rollback.** Ele commita. Use `@TestTransaction` para reverter; para HTTP, limpe os dados.
- **Depender de ordem de teste.** O contexto é compartilhado e o banco pode manter estado. Cada teste cria e limpa o que precisa; não confie no anterior.
- **Muitos `@TestProfile`.** Cada perfil reinicia a aplicação. Agrupe cenários e prefira configuração comum.
- **Mockar o que deveria ser integração.** Mock de repositório não pega SQL inválido, constraint ou N+1. Se o risco está na query, use banco real.
- **Esquecer o `@ApplicationScoped` no REST client.** `@InjectMock @RestClient` exige escopo normal; sem ele, o mock não substitui.
- **Testar startup com `@InjectMock`.** O bean já foi usado antes do mock existir. Para startup, `@Alternative` é o caminho.
- **Suíte lenta sem perceber.** Meça o tempo por classe. Um teste de 30 segundos pode ser um contexto extra, um container sem reuso ou uma espera fixa.

## Checklist de domínio

- [ ] Você escolhe entre teste puro, `@QuarkusTest` e `@QuarkusIntegrationTest` pelo risco que quer cobrir
- [ ] Você usa `@TestTransaction` para rollback em chamadas diretas e limpa dados em testes HTTP
- [ ] Você configura Dev Services e sabe desligá-lo quando o CI fornece o banco
- [ ] Você usa `@TestProfile` com moderação e entende o custo de reiniciar o contexto
- [ ] Você mocka a fronteira externa, não a query que precisa validar
- [ ] Você mede a suíte e investiga contextos e containers desnecessários

## Para ir além

- [Quarkus — Testing Your Application](https://quarkus.io/guides/getting-started-testing)
- [Quarkus — Dev Services](https://quarkus.io/guides/dev-services)
- [Quarkus — Continuous Testing](https://quarkus.io/guides/continuous-testing)
- [Martin Fowler — Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
