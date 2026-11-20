> **Em uma frase:** teste assíncrono não espera "um tempinho"; ele espera um sinal — e falha com timeout quando o sinal não chega.

`Thread.sleep(2000)` é o sintoma de um teste que não sabe o que está esperando. Ele deixa a suíte lenta quando funciona e instável quando a máquina está carregada: às vezes 2 segundos não bastam, às vezes o efeito já aconteceu e o teste ainda dorme. A correção é assinar o publisher, observar os sinais e impor um prazo curto.

## O problema

Testar `Uni` com `.await().indefinitely()` esconde deadlock: se a cadeia nunca completar, o build trava em vez de falhar. Testar `Multi` com `collect().asList().await()` não verifica backpressure, ordem nem cancelamento. Testar um consumidor de fila com `sleep` verifica que o tempo passou, não que o efeito aconteceu.

Há também o problema de contexto. Hibernate Reactive e Vert.x exigem que certas operações rodem no event loop ou em um contexto Vert.x. Um teste JUnit comum executa na thread principal; a transação, o `ThreadLocal` e o contexto de sessão não são os mesmos da aplicação.

## Como funciona

| Ferramenta | Verifica | Quando usar |
|---|---|---|
| `UniAssertSubscriber` | Item, falha, cancelamento de um `Uni` | Teste unitário de Mutiny puro |
| `UniAsserter` + `@RunOnVertxContext` | `Uni` dentro do contexto Quarkus/Vert.x | Teste de integração com Hibernate Reactive |
| `AssertSubscriber` | Sequência, demanda e conclusão de um `Multi` | Backpressure e lotes |
| `StepVerifier` | Sinais de `Mono`/`Flux`, inclusive tempo virtual | Código Reactor |
| Awaitility | Efeito observável que ainda vai acontecer | Fila, evento, consistência eventual |
| `@TestTransaction` / `@TestReactiveTransaction` | Rollback ao fim do teste | Testes de banco |

O `UniAsserter` do Quarkus é uma interface injetada como parâmetro do teste, usada com `@RunOnVertxContext`. Ela agenda asserções que rodam dentro do contexto Vert.x: `assertThat`, `assertFailedWith`, `execute`, `assertEquals`. Não confunda com o antigo `UniAsserter` do Mutiny 1.x, que foi removido no Mutiny 2.x; para Mutiny puro, o equivalente atual é `UniAssertSubscriber`.

## Na prática

Teste de integração com contexto Vert.x e asserção sobre item e falha:

```java
package com.exemplo.saldo;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.vertx.RunOnVertxContext;
import io.quarkus.test.vertx.UniAsserter;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
class ConsultaSaldoTest {

    @Inject
    ConsultaSaldo service;

    @Test
    @RunOnVertxContext
    void devolveSaldoDoCacheQuandoBancoFalha(UniAsserter asserter) {
        asserter.assertThat(
            () -> service.porConta("123"),
            saldo -> {
                assertEquals(1500L, saldo.valor());
                assertTrue(saldo.origemCache());
            });
    }

    @Test
    @RunOnVertxContext
    void validacaoNaoViraFallback(UniAsserter asserter) {
        asserter.assertFailedWith(
            () -> service.porConta(""),
            IllegalArgumentException.class);
    }
}
```

As asserções são registradas e executadas pelo extension ao fim do método; se o `Uni` não emitir, o teste falha por timeout em vez de travar. Para um teste unitário sem Quarkus, assine diretamente:

```java
import io.smallrye.mutiny.helpers.test.UniAssertSubscriber;
import java.time.Duration;

service.porConta("123")
    .subscribe().withSubscriber(UniAssertSubscriber.create())
    .awaitItem(Duration.ofSeconds(1))
    .assertItem(new Saldo("123", 1500))
    .assertCompleted();
```

`awaitItem(Duration)` falha se o item não chegar; `assertFailedWith` verifica o tipo da falha; `cancel()` seguido de `assertNotTerminated()` prova que o cancelamento interrompeu a cadeia. Para `Multi`, `AssertSubscriber` permite controlar a demanda:

```java
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.helpers.test.AssertSubscriber;
import java.util.List;

AssertSubscriber<List<Integer>> assinante = Multi.createFrom().range(0, 7)
    .group().intoLists().of(3)
    .subscribe().withSubscriber(AssertSubscriber.create(0));

assinante.assertHasNotReceivedAnyItem();
assinante.request(1).awaitNextItem(Duration.ofSeconds(1));
assertEquals(List.of(0, 1, 2), assinante.getLastItem());
assinante.assertNotTerminated();

assinante.request(2).awaitCompletion(Duration.ofSeconds(1));
assertEquals(List.of(List.of(0, 1, 2), List.of(3, 4, 5), List.of(6)),
             assinante.getItems());
```

Para efeitos que acontecem fora do publisher, Awaitility:

```java
import static org.awaitility.Awaitility.await;

await().atMost(Duration.ofSeconds(5))
    .pollInterval(Duration.ofMillis(100))
    .untilAsserted(() -> assertEquals(1, repository.contarPorPedido("p-1")));
```

E para Reactor, `StepVerifier` declara a sequência exata de sinais. Com `withVirtualTime`, o tempo é controlado pelo scheduler de teste, sem esperar de verdade:

```java
StepVerifier.withVirtualTime(() -> Flux.interval(Duration.ofSeconds(1)).take(3))
    .thenAwait(Duration.ofSeconds(3))
    .expectNext(0L, 1L, 2L)
    .verifyComplete();
```

`@TestTransaction` faz rollback de testes JPA bloqueantes. Em Hibernate Reactive, use `@TestReactiveTransaction` ou o `TransactionalUniAsserter`, porque a transação precisa acompanhar o contexto reativo. Um `@Timeout(5)` do JUnit é uma boa rede de segurança, mas nunca substitui a espera pelo sinal.

## Armadilhas comuns

- `Thread.sleep` como sincronização: lento e ainda instável.
- `await().indefinitely()`: transforma deadlock em build travado.
- Testar apenas o caminho feliz e nunca o cancelamento ou a falha.
- `StepVerifier` sem `verifyComplete()` ou `verify()`: o teste não executa a sequência.
- Testar `Multi` com `asList` e não verificar demanda, ordem ou tamanho de lote.
- Deixar dados de teste no banco e depender da ordem de execução.
- Timeout de teste maior que o do CI inteiro: uma falha custa minutos.

## Checklist de domínio

- [ ] Nenhum teste assíncrono meu usa `Thread.sleep` para sincronizar.
- [ ] Verifico item, falha e cancelamento de um `Uni`.
- [ ] Uso `AssertSubscriber` para provar backpressure em lotes.
- [ ] Sei usar `UniAsserter` com `@RunOnVertxContext` em teste Quarkus.
- [ ] Controlo tempo com scheduler de teste em vez de esperar o relógio real.
- [ ] Meus testes de banco limpam ou revertem o estado.

## Para ir além

Leia o guia de testes do Quarkus sobre `@RunOnVertxContext` e a documentação do StepVerifier. Depois converta um teste com `sleep` em um teste com Awaitility e compare o tempo e a estabilidade da suíte.

- [Quarkus — Testing reactive applications](https://quarkus.io/guides/getting-started-testing)
- [Mutiny — Creating Uni pipelines](https://smallrye.io/smallrye-mutiny/2.9.5/tutorials/creating-uni-pipelines/)
- [Reactor — StepVerifier](https://projectreactor.io/docs/test/release/api/reactor/test/StepVerifier.html)
- [Awaitility](https://github.com/awaitility/awaitility)
