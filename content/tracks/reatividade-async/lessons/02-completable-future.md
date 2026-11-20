> **Em uma frase:** `CompletableFuture` compõe chamadas assíncronas, mas cada etapa esconde uma decisão sobre thread, exceção e prazo — e `get()` no meio do caminho devolve o problema que você tentou resolver.

Compor I/O é o caso mais comum de assincronia em backend: buscar produto, preço e estoque em paralelo, aplicar uma regra e responder. `CompletableFuture` resolve isso muito bem quando você distingue transformar, encadear e combinar — e quando trata falha de forma explícita.

## O problema

Uma vitrine precisa de três chamadas independentes e de uma quarta que depende do vendedor do produto. Feitas em sequência, a latência é a soma. Feitas com `get()` no meio, a thread fica presa e o paralelismo evapora. Se uma fonte falhar, a resposta não pode ser um `CompletionException` cru nem um objeto silenciosamente vazio.

O objetivo é montar a resposta com todas as fontes em voo ao mesmo tempo, falhar com causa legível e nunca bloquear a thread de quem chamou.

## Como funciona

Três operações parecem iguais, mas têm papéis diferentes:

- `thenApply(Function<T,U>)` transforma o valor de forma síncrona. Se a função demora ou bloqueia, ela roda na thread que completou o future.
- `thenCompose(Function<T, CompletionStage<U>>)` é o `flatMap`: a próxima etapa também é assíncrona e o resultado é achatado, sem `CompletableFuture<CompletableFuture<U>>`.
- `thenCombine(other, BiFunction<T,U,V>)` junta dois futures independentes quando ambos terminam.

O fan-out abaixo usa um executor dedicado para I/O. Repare que `campanha` depende de `produto`, mas já começa assim que o produto chega, em paralelo com preço e estoque:

```java
package br.com.loja.catalogo;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public final class CatalogoService {

    private final ExecutorService io = Executors.newFixedThreadPool(16);
    private final ProdutoClient produtos;
    private final PrecoClient precos;
    private final EstoqueClient estoque;
    private final CampanhaClient campanhas;

    public CatalogoService(ProdutoClient produtos, PrecoClient precos,
                           EstoqueClient estoque, CampanhaClient campanhas) {
        this.produtos = produtos;
        this.precos = precos;
        this.estoque = estoque;
        this.campanhas = campanhas;
    }

    public CompletableFuture<Vitrine> vitrine(long produtoId) {
        var produto = CompletableFuture.supplyAsync(
            () -> produtos.buscar(produtoId), io);
        var preco = CompletableFuture.supplyAsync(
            () -> precos.atual(produtoId), io);
        var estoque = CompletableFuture.supplyAsync(
            () -> estoque.disponivel(produtoId), io);

        // Depende do produto, mas não bloqueia preço nem estoque.
        var campanha = produto.thenCompose(p ->
            CompletableFuture.supplyAsync(
                () -> campanhas.doVendedor(p.vendedorId()), io));

        return CompletableFuture.allOf(produto, preco, estoque, campanha)
            .thenApply(ignored -> new Vitrine(
                produto.join(), preco.join(), estoque.join(), campanha.join()))
            .orTimeout(1500, TimeUnit.MILLISECONDS)
            .exceptionally(ex -> Vitrine.indisponivel(produtoId, raiz(ex)));
    }

    private static Throwable raiz(Throwable ex) {
        return ex.getCause() != null ? ex.getCause() : ex;
    }
}
```

`allOf` retorna `CompletableFuture<Void>` e não entrega resultados. Os `join()` acima são seguros porque só rodam depois que todos completaram — e apenas no `thenApply`, nunca no meio da composição. Se qualquer future falhar, `allOf` falha, o `thenApply` é pulado e `exceptionally` produz o fallback. Os demais futures não são cancelados automaticamente.

Para observar erro sem alterar o resultado, use `whenComplete` antes de recuperar. A ordem importa: depois de `handle`, o erro já foi consumido e `whenComplete` não vê mais nada.

```java
public CompletableFuture<Preco> precoComFallback(long id) {
    return CompletableFuture.supplyAsync(() -> precos.atual(id), io)
        .whenComplete((preco, erro) -> {
            if (erro != null) log.warn("preço indisponível para {}", id, erro);
        })
        .handle((preco, erro) -> erro == null ? preco : Preco.ultimoConhecido(id));
}
```

| Operação | Recebe | Retorna | Use quando |
|---|---|---|---|
| `thenApply` | `T → U` | `CF<U>` | transformação síncrona e barata |
| `thenCompose` | `T → CF<U>` | `CF<U>` | a próxima etapa depende do valor |
| `thenCombine` | outro `CF` + `BiFunction` | `CF<V>` | duas chamadas independentes |
| `allOf` | vários `CF<?>` | `CF<Void>` | agregar N resultados |
| `anyOf` | vários `CF<?>` | `CF<Object>` | primeira resposta vence |
| `exceptionally` | `Throwable → T` | `CF<T>` | fallback simples |
| `handle` | `(T, Throwable) → U` | `CF<U>` | valor e erro no mesmo lugar |

## Na prática

Sempre passe um executor explícito. O padrão é o `ForkJoinPool.commonPool()`, compartilhado com streams paralelos e com poucas threads; uma chamada JDBC pode travar todo mundo. Um pool de I/O com nome (`pedido-io-0`) e fila limitada facilita stack traces e métricas.

`allOf` não preserva a causa individual de forma amigável: o future agregado falha com a primeira exceção, mas você perde saber qual fonte falhou se não guardar referências. Se a regra permite resposta parcial, trate cada future com `exceptionally` antes de agregar. Se não permite, propague a falha e traduza na borda.

Teste com `join()` apenas na asserção final. O teste abaixo usa implementações falsas e um timeout para não pendurar a suíte:

```java
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.assertEquals;

@Test
void vitrineCombinaAsTresFontes() {
    var service = new CatalogoService(
        id -> new Produto(id, "Teclado", 7L),
        id -> new Preco(new BigDecimal("199.90")),
        id -> Estoque.disponivel(12),
        vendedorId -> Campanha.nenhuma());

    var vitrine = service.vitrine(42)
        .orTimeout(2, TimeUnit.SECONDS)
        .join(); // join só na borda do teste

    assertEquals("Teclado", vitrine.produto().nome());
    assertEquals(new BigDecimal("199.90"), vitrine.preco().valor());
}
```

## Armadilhas comuns

- `thenApply` cuja função retorna outro future, produzindo `CF<CF<T>>` e um resultado que nunca é o valor esperado.
- `get()` ou `join()` no meio da composição: bloqueia a thread e pode esgotar o pool.
- `exceptionally(e -> null)` sem política: o erro vira ausência de dado e ninguém percebe.
- `allOf(...).join()` sem timeout; uma dependência lenta pendura a requisição para sempre.
- Usar `commonPool` para I/O bloqueante e culpar o `CompletableFuture` pela lentidão.
- `whenComplete` colocado depois de `handle` e a impressão de que o erro desapareceu.
- Ignorar o `Throwable` recebido em `whenComplete`: exceção não observada não melhora o sistema.

## Checklist de domínio

- [ ] Distingo `thenApply`, `thenCompose`, `thenCombine`, `allOf` e `anyOf`.
- [ ] Passo executor explícito para toda operação de I/O.
- [ ] Sei onde a exceção é criada e onde ela é traduzida para o cliente.
- [ ] Uso timeout no future e no cliente HTTP subjacente.
- [ ] Meu teste bloqueia apenas na asserção final e tem prazo.

## Para ir além

Leia o javadoc de `CompletableFuture` e de `CompletionStage` com atenção às variantes `*Async` e ao tratamento de exceções. Depois transforme três chamadas sequenciais em um fan-out com `allOf`, meça o p99 antes e depois e simule a falha de uma fonte para validar o fallback.

- [Java 21 — CompletableFuture](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
- [Java 21 — CompletionStage](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/CompletionStage.html)
- [Java 21 — ExecutorService](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ExecutorService.html)
