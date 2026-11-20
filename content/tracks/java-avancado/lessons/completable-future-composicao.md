> **Em uma frase:** `CompletableFuture` compõe assincronia, mas cada `thenApply` é uma nova etapa que pode esconder exceção, perder contexto ou rodar no pool errado.

Compor chamadas assíncronas sem bloquear é o pão de cada dia de um backend Java. `CompletableFuture` resolve, desde que você entenda a diferença entre transformar (`thenApply`), encadear (`thenCompose`), combinar (`thenCombine`) e recuperar (`handle`).

## O problema

Você precisa buscar cliente, pedido e pagamento em paralelo e montar uma resposta. Fazer três chamadas sequenciais soma latências. Fazer `future.get()` no meio anula o ganho. E se uma falhar, a resposta precisa ser parcial ou um erro claro — não um `CompletionException` cru.

## Como funciona

`thenApply` transforma o valor; `thenCompose` achata um future que retorna outro future; `thenCombine` junta dois independentes.

```java
CompletableFuture<Resumo> resumo(long id) {
    var cliente = CompletableFuture.supplyAsync(() -> clienteClient.buscar(id), io);
    var pedido  = CompletableFuture.supplyAsync(() -> pedidoClient.buscar(id), io);
    var pagto   = CompletableFuture.supplyAsync(() -> pagamentoClient.buscar(id), io);

    return CompletableFuture.allOf(cliente, pedido, pagto)
        .thenApply(v -> new Resumo(cliente.join(), pedido.join(), pagto.join()))
        .orTimeout(2, TimeUnit.SECONDS)
        .exceptionally(err -> Resumo.indisponivel(id, causaRaiz(err)));
}
```

Exceções: `exceptionally` recupera; `handle` vê valor e erro; `whenComplete` observa sem alterar. `allOf` falha se qualquer um falhar; para tolerância parcial, use `anyOf` ou trate cada future individualmente.

```java
future.handle((valor, erro) -> erro == null ? valor : fallback())
      .thenAccept(this::publicar);
```

## Na prática

Sempre passe um executor explícito. O padrão é `ForkJoinPool.commonPool()`, compartilhado com streams paralelos e com tamanho fixo — uma chamada bloqueante pode travar todo o resto. Crie um pool para I/O e limite com `Semaphore`.

Propague contexto: `ThreadLocal` (incluindo MDC de logging e tracing) não atravessa `supplyAsync` automaticamente. Use `MDC.getCopyOfContextMap()` ou uma biblioteca de contexto.

Timeouts: `orTimeout` e `completeOnTimeout` ajudam, mas não cancelam a chamada HTTP subjacente. Configure timeout no cliente também. Em uma aplicação Quarkus, prefira o REST Client com timeouts explícitos e um executor nomeado para trabalho bloqueante.

## Armadilhas comuns

- `thenApply` retornando `CompletableFuture` e produzindo `CompletableFuture<CompletableFuture<T>>`.
- `join()` dentro de uma etapa que roda no mesmo pool: deadlock por esgotamento.
- Engolir exceção com `exceptionally(e -> null)` e seguir como se nada tivesse acontecido.
- `allOf(...).join()` sem timeout.
- Usar `commonPool` para I/O bloqueante.

## Checklist de domínio

- [ ] Distingo `thenApply`, `thenCompose`, `thenCombine` e `handle`.
- [ ] Passo executor explícito para I/O.
- [ ] Propago contexto de log/tracing.
- [ ] Tenho timeout no future e no cliente.
- [ ] Sei compor falha parcial sem perder a causa.

## Para ir além

Leia o javadoc de `CompletableFuture` e o guia de REST Client do Quarkus. Depois converta três chamadas sequenciais em paralelas e meça o p99 antes e depois.
