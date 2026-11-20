> **Em uma frase:** versão é promessa de compatibilidade, paginação é contrato de custo e OpenAPI é o contrato legível: os três precisam ser decididos antes do primeiro cliente integrar, não depois que o banco já tem milhões de linhas.

## O problema

A primeira versão funciona. Meses depois, alguém renomeia `valor` para `totalCentavos`, remove um campo que “ninguém usa” e muda a ordenação padrão. O cliente móvel quebra em produção, e o time descobre que não havia contrato nem estratégia de versão.

Paginação tem problema parecido. `page=0` e `page=1` parecem inofensivos até a página 5.000 varrer milhões de linhas para devolver vinte. Filtros opcionais viram uma explosão de `if` e consultas diferentes; o OpenAPI, quando existe, está desatualizado em relação ao código.

## Como funciona

Há três formas usuais de versionar. Na URL (`/v1/pedidos`), o mais explícito e fácil de operar, ao custo de duplicar rotas. Em header (`X-API-Version: 2`), que mantém a URL estável mas exige roteamento e dificulta o cache. No media type (`application/vnd.acme.v2+json`), que usa content negotiation do HTTP e é elegante, porém menos visível para quem consome.

| Estratégia | Vantagem | Custo |
|---|---|---|
| URL | Visível, cacheável, simples de documentar | Duplica paths e recursos |
| Header | URL estável, versão explícita | Roteamento extra, cache varia por header |
| Media type | Alinhado ao HTTP, negociação nativa | Cliente precisa enviar `Accept` correto |

Adições compatíveis não exigem versão nova: campo opcional na resposta, endpoint novo, campo novo aceito no request. Remoção, renomeação, mudança de tipo, validação mais rígida e alteração de status são quebras. Clientes devem ignorar campos desconhecidos; se o seu não ignora, versione.

Para listagens, `Page.of(page, size)` cria a página, `PanacheQuery.page(...)` aplica e `count()` devolve o total independente da paginação. `list()` materializa os itens; `project(...)` evita carregar a entidade inteira quando a resposta é um resumo. O `count` é uma segunda query: em tabelas enormes, considere cachear ou omitir o total quando o cliente usa cursor.

| Paginação | Consulta | Custo em profundidade | Estabilidade |
|---|---|---|---|
| Offset (`page`) | `LIMIT/OFFSET` | Cresce com o offset | Pode pular/duplicar com escrita |
| Keyset (`cursor`) | `WHERE chave < :ultima` | Constante | Estável com ordenação total |
| Snapshot | cursor + versão/timestamp | Constante | Estável se o snapshot existir |

Offset profundo é caro porque o banco lê e descarta as linhas anteriores. Keyset usa a última chave como âncora e exige ordenação total, com desempate por `id`. O cursor deve ser opaco — Base64 de `criadoEm|id` — para você poder mudar o formato depois.

Filtros devem ser um conjunto fechado e documentado. Monte a query dinamicamente com predicados e parâmetros nomeados; não aceite nome de coluna nem direção de ordenação vindos do cliente. Um `Sort` whitelistado evita injeção de HQL e ordenações que estouram o índice.

## Na prática

```java
package com.exemplo.pedido.api;

import java.util.List;

public record PageResponse<T>(List<T> items, int page, int size, long total, int totalPages) {
    public static <T> PageResponse<T> of(List<T> items, int page, int size, long total) {
        int paginas = size == 0 ? 0 : (int) Math.ceil((double) total / size);
        return new PageResponse<>(items, page, size, total, paginas);
    }
}
```

```java
package com.exemplo.pedido.api;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.media.*;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;

@Path("/v1/pedidos")
@Produces(MediaType.APPLICATION_JSON)
public class PedidoResource {

    private final PedidoService service;

    public PedidoResource(PedidoService service) {
        this.service = service;
    }

    @GET
    @Operation(summary = "Lista pedidos paginados",
        description = "Ordena por criação decrescente e desempata por id.")
    @APIResponse(responseCode = "200", description = "Página de pedidos",
        content = @Content(mediaType = MediaType.APPLICATION_JSON,
            schema = @Schema(implementation = PageResponse.class)))
    public PageResponse<PedidoResumo> listar(
            @QueryParam("page") @DefaultValue("0") @Min(0) int page,
            @QueryParam("size") @DefaultValue("20") @Min(1) @Max(100) int size,
            @QueryParam("status") StatusPedido status) {
        return service.listar(page, size, status);
    }
}
```

O serviço aplica filtro e paginação em uma consulta, com `count` separado:

```java
package com.exemplo.pedido;

import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.HashMap;

@ApplicationScoped
public class PedidoService {

    private static final Sort ORDEM = Sort.descending("criadoEm").and("id");

    public PageResponse<PedidoResumo> listar(int page, int size, StatusPedido status) {
        var hql = new StringBuilder("from Pedido p where 1 = 1");
        var params = new HashMap<String, Object>();

        if (status != null) {
            hql.append(" and p.status = :status");
            params.put("status", status);
        }

        PanacheQuery<Pedido> query = Pedido.find(hql.toString(), ORDEM, params);
        long total = query.count();
        var itens = query.page(Page.of(page, size)).list().stream()
            .map(PedidoResumo::de)
            .toList();

        return PageResponse.of(itens, page, size, total);
    }
}
```

Para keyset, o cursor carrega a última tupla e a consulta não usa offset:

```java
var hql = """
    from Pedido p
    where (p.criadoEm < :ts or (p.criadoEm = :ts and p.id < :id))
    order by p.criadoEm desc, p.id desc
    """;
var query = Pedido.find(hql, Map.of("ts", cursor.criadoEm(), "id", cursor.id()))
    .page(Page.ofSize(20));
```

O contrato OpenAPI é gerado no build pelo `quarkus-smallrye-openapi` e servido em `/q/openapi`; `quarkus.smallrye-openapi.store-schema-directory=target/openapi` guarda o documento como artefato para diff no CI. Documente parâmetros com `@Parameter` e versione o documento em `quarkus.smallrye-openapi.info-version`.

## Armadilhas comuns

- **Versionar tudo.** Cada versão custa manutenção, testes e suporte; adição compatível não pede `/v2`.
- **Remover campo “sem uso”.** Sem telemetria de consumo, você não sabe quem usa; deprecie com header `Deprecation` e prazo.
- **Aceitar `sort` arbitrário.** Nome de coluna vindo do cliente é injeção de HQL e varredura de tabela.
- **Paginar sem ordenação total.** Sem desempate por `id`, duas linhas com o mesmo timestamp podem aparecer ou sumir entre páginas.
- **Contar sempre.** `count()` em tabela grande é query cara; ofereça cursor quando o total não for necessário.
- **Confiar no OpenAPI escrito à mão.** Ele diverge do código; gere no build e falhe o pipeline quando o contrato mudar sem revisão.

## Checklist de domínio

- [ ] Você escolhe a estratégia de versão pelo custo de manutenção, não por moda
- [ ] Você distingue mudança compatível de quebra de contrato
- [ ] Você implementa offset com `Page.of` e `PanacheQuery.count`
- [ ] Você sabe quando trocar offset por keyset e como tornar o cursor opaco
- [ ] Você filtra e ordena com whitelist, sem concatenar entrada do cliente
- [ ] Você gera OpenAPI no build e versiona o artefato

## Para ir além

- [Quarkus — Hibernate ORM with Panache: paging](https://quarkus.io/guides/hibernate-orm-panache#paging)
- [Quarkus — OpenAPI and Swagger UI](https://quarkus.io/guides/openapi-swaggerui)
- [Quarkus — Writing REST services with Quarkus REST](https://quarkus.io/guides/rest)
- [Martin Fowler — Richardson Maturity Model](https://martinfowler.com/articles/richardsonMaturityModel.html)
