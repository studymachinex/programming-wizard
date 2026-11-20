> **Em uma frase:** `Uni` representa uma resposta que pode falhar; `Multi`, um fluxo que pode não terminar. Os dois são lazies, e nada acontece até alguém assinar.

Mutiny é a API reativa usada pelo Quarkus, mas o modelo mental vale para qualquer biblioteca: você descreve a computação, compõe etapas e só então assina. Confundir construção com execução é a origem do bug mais silencioso de código reativo — o efeito que nunca acontece.

## O problema

Um serviço precisa buscar o cliente, o último pedido e o status do pagamento. Feito em sequência, são três latências somadas. Feito com `await().indefinitely()` no meio, a thread fica bloqueada e o ganho desaparece. E se o cliente não existir, o fluxo inteiro precisa falhar com um erro de negócio, não com um `NullPointerException` no meio da composição.

O time monta os `Uni`s, devolve a cadeia para o Quarkus e esquece de assinar em um teste. O teste passa; em produção, nada é gravado. O problema não é a API: é tratar `Uni` como se fosse um valor já calculado.

## Como funciona

`Uni<T>` emite zero ou um item, ou falha. `Multi<T>` emite zero ou muitos itens, ou falha. `Uni` pode emitir `null`; `Multi` não, porque o contrato Reactive Streams proíbe `null` em `onNext`. `Uni` é para request/response; `Multi`, para streams e eventos.

Os dois são lazies. `Uni.createFrom().item(valor)` não executa nada; descreve uma fonte. `subscribe().with(...)` dispara a assinatura e retorna um `Cancellable`. Cada assinatura de uma fonte fria reexecuta a computação; se você precisa compartilhar o resultado, memoize conscientemente. `memoize()` evita repetir a chamada HTTP quando o mesmo `Uni` é assinado mais de uma vez.

As operações centrais:

- `onItem().transform(fn)` transforma o item de forma síncrona.
- `chain(fn)` ou `onItem().transformToUni(fn)` encadeia uma função que retorna outro `Uni`, achatando o resultado.
- `Uni.createFrom().item(valor)` e `.failure(erro)` descrevem fontes; `Multi.createFrom().items(...)` e `.iterable(...)` fazem o equivalente para vários itens.
- `Uni.combine().all().unis(a, b).asTuple()` assina vários `Uni`s e combina os resultados.
- `onFailure().recoverWithItem(...)` e `recoverWithUni(...)` tratam falha; `retry()` repete.

O exemplo abaixo combina dois serviços independentes. `asTuple()` evita `Uni<Uni<...>>` e deixa o tipo explícito:

```java
package br.com.loja.resumo;

import io.smallrye.mutiny.Uni;

public final class ResumoService {

    private final ClienteService clientes;
    private final PedidoService pedidos;

    public ResumoService(ClienteService clientes, PedidoService pedidos) {
        this.clientes = clientes;
        this.pedidos = pedidos;
    }

    public Uni<Resumo> resumo(long clienteId) {
        Uni<Cliente> cliente = clientes.buscar(clienteId);
        Uni<Pedido> pedido = pedidos.ultimo(clienteId);

        return Uni.combine().all().unis(cliente, pedido)
            .asTuple()
            .onItem().transform(t -> new Resumo(t.getItem1(), t.getItem2()))
            .onFailure().recoverWithItem(() -> Resumo.indisponivel(clienteId));
    }
}
```

Quando a segunda chamada depende do resultado da primeira, `chain` é o operador. Repare que `transformToUni` faz o mesmo papel e é útil quando você quer deixar explícito que a etapa é assíncrona:

```java
public Uni<StatusPagamento> status(long clienteId) {
    return clientes.buscar(clienteId)
        .chain(c -> pedidos.ultimo(c.id()))              // Uni<Pedido>
        .onItem().transformToUni(p -> pagamentos.status(p.id()))
        .onFailure().recoverWithItem(StatusPagamento.INDISPONIVEL);
}
```

Em `Multi`, a assinatura é a mesma, mas a demanda importa. Use `transformToUniAndConcatenate` para preservar a ordem e `onOverflow()` para lidar com fontes que não respeitam contrapressão:

```java
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.subscription.Cancellable;

public Cancellable iniciar(java.util.stream.Stream<Long> ids) {
    return Multi.createFrom().emitter(em -> {
            ids.forEach(em::emit); // fonte que não espera demanda
            em.complete();
        })
        .onOverflow().buffer(256)
        .onItem().transformToUniAndConcatenate(this::buscar)
        .subscribe().with(
            item -> log.info("processado {}", item.id()),
            falha -> log.error("stream falhou", falha));
}
```

| Aspecto | `Uni` | `Multi` |
|---|---|---|
| Cardinalidade | 0 ou 1 item | 0..N itens |
| Item nulo | Permitido | Proibido pelo contrato |
| Contrapressão | Não se aplica | Central; `request(n)` |
| Combinação | `combine().all().unis(...)` | Operadores de merge/concatenação |
| Uso típico | Request/response | Stream, eventos, lote |
| Assinatura | `subscribe().with(...)` | `subscribe().with(...)` |

## Na prática

Em Quarkus, retorne `Uni`/`Multi` do resource e deixe o framework assinar. Não chame `await().indefinitely()` no caminho da requisição: ele bloqueia a thread e, no event loop, degrada todas as conexões. Reserve `await` para testes, `main` de CLI e scripts.

Teste com um `UniAsserter` injetado: `asserter.assertThat(() -> service.resumo(42), resumo -> ...)`. Ele assina o `Uni`, aplica a asserção e falha com timeout se nada acontecer. Para `Multi`, use `AssertSubscriber` e verifique itens, conclusão e falha — sem `Thread.sleep`.

Trate falha por categoria. Um `404` de cliente inexistente pode virar `Resumo.indisponivel`; um `TimeoutException` pode ser retry; um `NullPointerException` de bug não deve ser recuperado. `recoverWithItem` em tudo esconde exatamente os erros que você precisa ver.

`combine().all().unis(...)` assina todas as fontes ao mesmo tempo; um único failure derruba o combinado. Se a resposta aceita dado parcial, trate cada `Uni` com `recoverWithItem` antes de combinar. Para uma chamada que depende do resultado da anterior, use `chain`: `combine` não serve, porque as duas começam juntas. Sem `memoize`, um refresh de tela pode disparar duas gravações para o mesmo pedido.

Em `Multi`, guarde o `Cancellable` retornado por `subscribe().with(...)` e cancele no shutdown. `onOverflow().buffer(n)` limita a memória e falha quando enche; `drop()` e `dropPreviousItems()` são políticas de perda consciente. Nenhuma delas substitui um consumidor dimensionado para a carga.

`parallel()` divide o fluxo em rails (por padrão, um por núcleo), mas não paraleliza sozinho: é `ParallelFlux.runOn(scheduler)` que define onde cada rail executa. Use `parallel().runOn(Schedulers.parallel())` para CPU e volte com `sequential()` antes de operadores que exigem um único fluxo; para I/O, prefira `flatMap` com `subscribeOn(boundedElastic)` e concorrência limitada.

## Armadilhas comuns

- Construir o `Uni` e nunca assinar; nada executa e nenhum erro aparece.
- Usar `await().indefinitely()` dentro de um resource ou no event loop.
- `onItem().transform(fn)` em que `fn` retorna `Uni`, produzindo `Uni<Uni<T>>`.
- Devolver `null` de uma transformação em `Multi` e violar o contrato.
- Recuperar toda falha com um valor padrão, inclusive erros de programação.
- Ignorar o `Cancellable` e deixar assinaturas vivas depois que o cliente desistiu.
- Assinar duas vezes uma fonte fria e duplicar efeitos colaterais.

## Checklist de domínio

- [ ] Escolho `Uni` ou `Multi` pela cardinalidade e pelo contrato.
- [ ] Explico por que nada acontece antes da assinatura.
- [ ] Distingo `transform`, `chain` e `transformToUni`.
- [ ] Sei combinar `Uni`s e tratar falha parcial.
- [ ] Uso `await` apenas em teste ou CLI.
- [ ] Consigo cancelar um `Multi` e entendo a demanda.

## Para ir além

Leia a referência de `Uni` e `Multi` da Mutiny e o guia de combinação de itens. Depois escreva um serviço que consulta dois serviços em paralelo, um dependente do outro, e teste com `UniAsserter` — incluindo o caminho de falha e o cancelamento.

- [Mutiny — Uni and Multi](https://smallrye.io/smallrye-mutiny/2.9.3/reference/uni-and-multi/)
- [Mutiny — combining items](https://smallrye.io/smallrye-mutiny/2.9.3/guides/combining-items/)
- [Quarkus — Mutiny primer](https://quarkus.io/guides/mutiny-primer)
