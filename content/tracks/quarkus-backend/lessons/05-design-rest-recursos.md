> **Em uma frase:** REST é um contrato sobre recursos e representações, não um espelho do banco: a URL nomeia coisas, o verbo expressa a intenção e o DTO define o que o cliente pode ver e enviar.

## O problema

A API nasce como CRUD gerado e vira problema quando o domínio cresce. `GET /pedidos/1` devolve a entidade inteira, com cliente, itens e campos internos; o cliente passa a depender desse formato; uma coluna nova no banco quebra o consumidor. Operações de negócio viram `PUT /pedidos/1` com o corpo inteiro, e o cliente altera status, total e data de criação no mesmo request.

O outro extremo é a API anêmica: `GET /pedidos/status`, `POST /pedidos/atualizarStatus`, `POST /pedidos/cancelar`. A URL vira lista de funções RPC disfarçadas e cada cliente implementa sua própria máquina de estados.

## Como funciona

No Quarkus REST — o runtime RESTEasy Reactive, disponível com `quarkus-rest` e `quarkus-rest-jackson` — um resource é um bean CDI anotado com `@Path`. Cada método mapeia verbo, caminho, entrada e saída. O Jackson cuida do JSON quando a extensão está no classpath.

Um recurso é identificado por URL. `GET /pedidos/{id}` retorna a representação; `POST /pedidos` cria; `PUT` substitui; `PATCH` altera parcialmente; `DELETE` remove. `GET`, `PUT` e `DELETE` são idempotentes; `POST` não é, e é por isso que retry de criação precisa de chave de idempotência.

| Situação | Status | Corpo | Header relevante |
|---|---|---|---|
| Criação síncrona | `201 Created` | Representação criada | `Location` |
| Leitura bem-sucedida | `200 OK` | Representação | — |
| Remoção ou ação sem corpo | `204 No Content` | Vazio | — |
| Aceito para processamento | `202 Accepted` | Estado do job | `Location` |
| Recurso inexistente | `404 Not Found` | Problem | — |
| Conflito de estado | `409 Conflict` | Problem | — |
| Sintaxe válida, regra inválida | `422 Unprocessable Content` | Problem | — |

O DTO é a fronteira. Um `record` com os campos que o cliente pode ver documenta o contrato, impede mass assignment e evita que o Jackson traverse relacionamentos lazy. A entidade muda à vontade; o DTO só muda quando o contrato muda.

`Response` é a API padrão do Jakarta REST. `RestResponse` é a alternativa do Quarkus REST: tipada, mais agradável de compor e integrada aos exception mappers do runtime. Use `Response` quando precisar de portabilidade ou de recursos avançados; use `RestResponse` no dia a dia.

Sub-recursos fazem sentido quando a coleção filha tem identidade e ciclo próprios: `/pedidos/{id}/itens/{itemId}`. O método locator retorna um objeto com `@Path`; o runtime delega a ele a resolução. Não aninhe mais de dois níveis: URLs profundas são difíceis de versionar e autorizar.

Action endpoints existem para transições que não são substituição de representação. `POST /pedidos/{id}/cancelamento` comunica intenção, permite validar a máquina de estados e registrar auditoria. Um `PUT` no status obriga o cliente a conhecer as regras e abre espaço para alterar campos que não deveria. REST não é resposta para tudo: jobs longos pedem `202` e um recurso de status, lotes pedem endpoint próprio, e RPC puro pode ser mais honesto que CRUD fingido.

## Na prática

```java
package com.exemplo.pedido.api;

import java.util.List;
import java.util.UUID;

public record CriarPedidoRequest(UUID clienteId, List<ItemRequest> itens) {
    public record ItemRequest(UUID produtoId, int quantidade) {
    }
}
```

```java
package com.exemplo.pedido.api;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.time.Instant;
import java.util.UUID;
import org.jboss.resteasy.reactive.RestResponse;

@Path("/pedidos")
@Produces(MediaType.APPLICATION_JSON)
public class PedidoResource {

    private final PedidoService service;

    public PedidoResource(PedidoService service) {
        this.service = service;
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    public Response criar(CriarPedidoRequest request) {
        var pedido = service.criar(request);
        return Response.created(URI.create("/pedidos/" + pedido.id()))
            .entity(pedido)
            .build();
    }

    @GET
    @Path("/{id}")
    public RestResponse<PedidoResponse> buscar(@PathParam("id") UUID id) {
        return RestResponse.ok(service.buscar(id));
    }

    @POST
    @Path("/{id}/cancelamento")
    public RestResponse<PedidoResponse> cancelar(@PathParam("id") UUID id) {
        return RestResponse.ok(service.cancelar(id));
    }

    @Path("/{pedidoId}/itens")
    public ItemResource itens(@PathParam("pedidoId") UUID pedidoId) {
        return new ItemResource(service, pedidoId);
    }
}

record PedidoResponse(UUID id, String status, long totalCentavos, Instant criadoEm) {
}
```

O sub-recurso herda o caminho e resolve o pai no construtor:

```java
package com.exemplo.pedido.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.List;
import java.util.UUID;

@Produces(MediaType.APPLICATION_JSON)
public class ItemResource {

    private final PedidoService service;
    private final UUID pedidoId;

    public ItemResource(PedidoService service, UUID pedidoId) {
        this.service = service;
        this.pedidoId = pedidoId;
    }

    @GET
    public List<ItemResponse> listar() {
        return service.itens(pedidoId);
    }
}
```

`criar` devolve `Location` porque o cliente precisa saber onde o recurso nasceu. `cancelar` é `POST` porque é transição com regra, não substituição completa. Um `DELETE` devolveria `204` sem corpo.

## Armadilhas comuns

- **Devolver entidade JPA.** Vaza o schema, dispara lazy loading na serialização e cria acoplamento impossível de evoluir.
- **Usar `PUT` para tudo.** `PUT` substitui a representação inteira; usá-lo para “atualizar só o status” convida o cliente a enviar campos indevidos.
- **`200` em criação.** Sem `201` e `Location`, o cliente faz busca extra e o cache HTTP perde semântica.
- **URLs com verbos onde CRUD basta.** `/pedidos/criar` não é recurso; `POST /pedidos` é.
- **Aninhamento profundo.** Três níveis de posse já indicam que o filho merece URL própria.
- **`GET` com efeito colateral.** Proxies e clientes podem repetir ou pré-carregar a chamada.

## Checklist de domínio

- [ ] Você modela recursos por substantivos e usa verbos HTTP com a semântica correta
- [ ] Você devolve DTO e mantém a entidade fora do contrato
- [ ] Você escolhe status codes que o cliente trata sem ler texto livre
- [ ] Você usa `Location` e `201` ao criar, e `204` quando não há corpo
- [ ] Você reconhece quando uma ação pede endpoint próprio em vez de `PUT`
- [ ] Você sabe dizer quando REST não é a melhor interface

## Para ir além

- [Quarkus — Writing REST services with Quarkus REST](https://quarkus.io/guides/rest)
- [Jakarta RESTful Web Services 3.1](https://jakarta.ee/specifications/restful-ws/3.1/)
- [Martin Fowler — Richardson Maturity Model](https://martinfowler.com/articles/richardsonMaturityModel.html)
- [Quarkus — REST Client](https://quarkus.io/guides/rest-client)
