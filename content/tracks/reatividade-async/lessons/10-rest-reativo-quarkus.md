> **Em uma frase:** um resource reativo não é aquele que devolve `Uni`; é aquele cuja thread nunca fica esperando — e o tipo de retorno não conserta uma chamada bloqueante.

Quarkus REST (o antigo RESTEasy Reactive) aceita `Uni<T>` e `Multi<T>` como retorno. O framework assina o publisher, aplica backpressure quando faz sentido e libera a thread entre os sinais. Isso permite atender milhares de conexões com poucas threads de event loop — desde que ninguém bloqueie essas threads.

## O problema

O erro clássico é acreditar que `Uni<Pedido>` torna o código assíncrono. Se o método chama JDBC, lê um arquivo ou usa um cliente HTTP síncrono, a thread que executa a chamada fica presa. No event loop, essa thread atende centenas de conexões: uma consulta de 3 segundos trava todas elas. O sintoma é latência em cascata, CPU ociosa e um log de blocked thread alguns segundos depois.

O outro erro é acumular a resposta. Retornar `List<Fatura>` de 200 MB obriga a montar tudo em memória antes do primeiro byte. `Multi` resolve isso porque cada item é serializado e escrito conforme chega — mas só se a fonte também souber produzir aos poucos.

## Como funciona

O Quarkus decide a thread pelo tipo do método e pelas anotações:

| Cenário | Anotação | Onde executa | Observação |
|---|---|---|---|
| Driver reativo (Hibernate Reactive, Vert.x SQL client) | nenhuma | event loop | Não bloqueia; devolve `Uni`/`Multi` |
| JDBC, `Files`, cliente HTTP bloqueante | `@Blocking` | worker thread | Pool limitado; dimensione com cuidado |
| I/O bloqueante com muitas conexões | `@RunOnVirtualThread` | virtual thread | Java 21; não combine com `@Blocking` |
| Método não bloqueante dentro de classe `@Blocking` | `@NonBlocking` | event loop | Exceção explícita à regra da classe |

O tipo de retorno é o contrato: `Uni<T>` produz zero ou um item; `Multi<T>` produz zero ou muitos. Um `Multi` retornado por um resource é escrito incrementalmente. Com `@Produces(MediaType.SERVER_SENT_EVENTS)` e `@RestStreamElementType`, cada item vira um evento SSE. Sem SSE, um `Multi` JSON é serializado como array em streaming.

Para persistência, `quarkus-hibernate-reactive-panache` oferece `PanacheEntity` reativo e `Panache.withTransaction(...)`. A transação precisa envolver o `Uni`, não o método que apenas o constrói. `@Transactional` bloqueante não serve aqui: ela fecha antes de a assinatura acontecer.

## Na prática

Um resource com Hibernate Reactive e `RestResponse`:

```java
package com.exemplo.pedidos;

import io.quarkus.hibernate.reactive.panache.Panache;
import io.smallrye.mutiny.Uni;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jboss.resteasy.reactive.RestResponse;

@Path("/pedidos")
@Produces(MediaType.APPLICATION_JSON)
public class PedidoResource {

    @GET
    @Path("/{id}")
    public Uni<RestResponse<Pedido>> buscar(@PathParam("id") Long id) {
        return Pedido.<Pedido>findById(id)
            .map(pedido -> pedido == null
                ? RestResponse.<Pedido>notFound()
                : RestResponse.ok(pedido));
    }

    @POST
    public Uni<RestResponse<Pedido>> criar(PedidoRequest request) {
        return Panache.withTransaction(() ->
            Pedido.criar(request)
                .map(pedido -> RestResponse.status(RestResponse.Status.CREATED, pedido)));
    }
}
```

Nenhuma linha bloqueia: `findById` e `criar` devolvem `Uni`, e a transação abraça a continuação. Se o cliente desconectar, o Quarkus cancela o `Uni` — outro motivo para não iniciar efeitos irreversíveis antes da assinatura.

Streaming de um extrato com SSE:

```java
import io.smallrye.mutiny.Multi;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jboss.resteasy.reactive.RestStreamElementType;

@GET
@Path("/{conta}/extrato")
@Produces(MediaType.SERVER_SENT_EVENTS)
@RestStreamElementType(MediaType.APPLICATION_JSON)
public Multi<Lancamento> extrato(@PathParam("conta") String conta) {
    return repository.porConta(conta)
        .onOverflow().buffer(256);
}
```

O repositório precisa usar o driver reativo. Se ele fizer `SELECT` com JDBC e devolver um `Multi` construído a partir de uma lista já carregada, você ganhou apenas a sintaxe: a thread bloqueou e a memória já foi consumida. Para relatórios que exigem API bloqueante, isole com `@Blocking` e `StreamingOutput`, aceitando o custo de uma worker thread:

```java
@GET
@Path("/relatorio.csv")
@Produces("text/csv")
@Blocking
public StreamingOutput relatorio() {
    return saida -> {
        try (var writer = new BufferedWriter(new OutputStreamWriter(saida, StandardCharsets.UTF_8))) {
            for (String linha : relatorioService.linhas()) {
                writer.write(linha);
                writer.newLine();
            }
        }
    };
}
```

## Armadilhas comuns

- Chamar JDBC ou `RestClient` bloqueante em um método que retorna `Uni` sem `@Blocking`.
- Devolver `Multi` de uma `List` já materializada e chamar isso de streaming.
- Usar `@Transactional` em método que retorna `Uni`: a transação fecha na construção, não na execução.
- Misturar JDBC e Hibernate Reactive na mesma aplicação sem isolar os pools.
- Esquecer `quarkus-rest-jackson`: o endpoint compila, mas o JSON falha em runtime.
- Capturar exceções dentro do resource e devolver `200` com corpo de erro.

## Checklist de domínio

- [ ] Sei dizer se cada dependência do resource é reativa ou bloqueante.
- [ ] Escolho entre event loop, `@Blocking` e `@RunOnVirtualThread` com critério.
- [ ] Envolvo a transação reativa no `Uni`, não no método.
- [ ] Transmito respostas grandes com `Multi` e fonte incremental.
- [ ] Testo cancelamento e falha no meio do stream.
- [ ] Sei o que acontece com o event loop quando uma chamada JDBC escapa.

## Para ir além

Leia o guia de REST do Quarkus sobre streaming e o guia de Hibernate Reactive. Depois meça o tempo de resposta de um endpoint `Multi` com e sem uma chamada bloqueante escondida.

- [Quarkus — Writing REST services](https://quarkus.io/guides/rest)
- [Quarkus — Hibernate Reactive with Panache](https://quarkus.io/guides/hibernate-reactive)
- [Quarkus — Virtual threads](https://quarkus.io/guides/virtual-threads)
