> **Em uma frase:** pipeline é uma esteira de transformações — cada estágio recebe o resultado do anterior, e a ordem decide quanto trabalho você descarta antes de chegar ao estágio caro.

## O problema

O relatório de vendas por categoria demora 8 segundos. O pipeline começa com `$group` sobre a coleção inteira, depois `$unwind` dos itens e só no fim filtra os pedidos pagos do mês. O resultado está correto, mas o servidor agrupou milhões de documentos que seriam descartados.

Pipeline não é SQL com outra sintaxe. É uma sequência imperativa: o que entra no estágio é exatamente o que saiu do anterior. Mover um `$match` para o começo costuma valer mais que qualquer ajuste de hardware.

## Como funciona

Os estágios que você usa 90% do tempo:

| Estágio | O que faz | Cuidado |
|---|---|---|
| `$match` | filtra documentos | no início, usa índice |
| `$project` | escolhe e calcula campos | reduz payload se vier cedo |
| `$group` | agrega por chave | usa hash; memória limitada |
| `$unwind` | explode array em documentos | multiplica cardinalidade |
| `$lookup` | junta coleção estrangeira | roda por documento de entrada |
| `$facet` | vários subpipelines na mesma entrada | saída total limitada a 16 MB |

**Filtre cedo.** Um `$match` como primeiro estágio pode usar índice e reduzir o volume que atravessa todo o resto. O otimizador move alguns `$match` para frente, mas não transforma um `$match` que depende de `$group` em filtro de entrada.

**Reduza cedo.** `$project` antes de `$unwind` e `$lookup` diminui documentos e arrays. Se você só precisa de `categoria`, `preco` e `quantidade` dos itens, não carregue o item inteiro até o `$lookup`.

**`$unwind` explode.** Um pedido com 20 itens vira 20 documentos. Se depois você agrupar, o `$group` processa 20 vezes mais. Filtre o array antes com `$filter`; use `$unwind` só quando a granularidade for o item.

**`$group` usa memória.** O hash de grupos tem limite padrão de 100 MB por estágio. `allowDiskUse(true)` derrama para disco e evita erro, mas não torna de graça um agrupamento por chave de alta cardinalidade. Agrupar por `pedidoId` em 50 milhões de pedidos é diferente de agrupar por categoria.

```java
package com.exemplo.relatorios;

import com.mongodb.client.AggregateIterable;
import com.mongodb.client.MongoCollection;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import org.bson.Document;

public final class RelatorioVendas {

    private final MongoCollection<Document> pedidos;

    public RelatorioVendas(MongoCollection<Document> pedidos) {
        this.pedidos = pedidos;
    }

    // $match cedo usa o índice; $unwind só depois de reduzir o conjunto.
    public List<Document> topCategorias(Instant desde, int limite) {
        List<Document> pipeline = List.of(
                new Document("$match", new Document("status", "PAGO")
                        .append("criadoEm", new Document("$gte", Date.from(desde)))),
                new Document("$unwind", "$itens"),
                new Document("$group", new Document("_id", "$itens.categoria")
                        .append("receita", new Document("$sum", new Document("$multiply",
                                List.of("$itens.preco", "$itens.quantidade"))))
                        .append("pedidos", new Document("$addToSet", "$_id"))),
                new Document("$project", new Document("_id", 0)
                        .append("categoria", "$_id")
                        .append("receita", 1)
                        .append("qtdPedidos", new Document("$size", "$pedidos"))),
                new Document("$sort", new Document("receita", -1)),
                new Document("$limit", limite));

        AggregateIterable<Document> resultado = pedidos.aggregate(pipeline).allowDiskUse(true);
        return resultado.into(new ArrayList<>());
    }
}
```

**`$lookup` é um join por documento.** Para cada pedido que chega, o MongoDB executa uma busca na coleção `clientes`. Com índice em `_id`, é barato; sem índice, é uma varredura por pedido — o clássico N+1, agora dentro do servidor. A forma com `localField`/`foreignField` é a mais simples; a forma com `pipeline` permite filtrar e projetar antes de trazer o resultado.

Coloque `$limit` antes do `$lookup` quando estiver montando uma página. Não faz sentido enriquecer 2 milhões de pedidos para devolver 20.

```java
package com.exemplo.relatorios;

import com.mongodb.client.MongoCollection;
import java.util.ArrayList;
import java.util.List;
import org.bson.Document;

public final class PedidosComCliente {

    private final MongoCollection<Document> pedidos;

    public PedidosComCliente(MongoCollection<Document> pedidos) {
        this.pedidos = pedidos;
    }

    public List<Document> ultimos(String tenantId, int limite) {
        List<Document> pipeline = List.of(
                new Document("$match", new Document("tenantId", tenantId)),
                new Document("$sort", new Document("criadoEm", -1)),
                new Document("$limit", limite), // enriquece só a página
                new Document("$lookup", new Document("from", "clientes")
                        .append("let", new Document("clienteId", "$clienteId"))
                        .append("pipeline", List.of(
                                new Document("$match", new Document("$expr",
                                        new Document("$eq", List.of("$_id", "$$clienteId")))),
                                new Document("$project", new Document("_id", 0)
                                        .append("nome", 1))))
                        .append("as", "cliente")),
                new Document("$unwind", new Document("path", "$cliente")
                        .append("preserveNullAndEmptyArrays", true)));

        return pedidos.aggregate(pipeline).allowDiskUse(true).into(new ArrayList<>());
    }
}
```

## Na prática

`$facet` resolve vários relatórios na mesma passada: um subpipeline conta por status, outro calcula o top 10, outro soma receita. Todos partem do mesmo conjunto filtrado. O preço é que a saída inteira precisa caber em 16 MB e cada facet trabalha sobre o resultado já materializado — não há índice dentro do facet. Filtre e projete antes.

`$merge` materializa relatórios incrementais; `$out` substitui a coleção de destino e só deve rodar em job controlado.

Para "top N por grupo", não basta `$sort` antes de `$group`: o grupo não preserva ordem. Use `$setWindowFields` com `$rank` ou `$topN`, ou ordene depois de agrupar quando a métrica já estiver agregada.

## Armadilhas comuns

- **`$match` depois de `$group`.** O filtro vira pós-processamento e não usa índice.
- **`$lookup` sem índice na coleção estrangeira.** Uma varredura por documento de entrada.
- **`$lookup` antes de `$limit`.** Enriquece a coleção inteira para devolver uma página.
- **`$unwind` sem necessidade.** Multiplica documentos e memória; filtre o array antes.
- **`$unwind` sem `preserveNullAndEmptyArrays`.** Pedido sem item desaparece do relatório.
- **`$group` por chave quase única.** Hash enorme e pouca redução; repense a granularidade.
- **`$facet` com saída gigante.** Estoura o limite de 16 MB; pagine ou separe.
- **`allowDiskUse` como cura.** Ele evita o erro, não o custo de um pipeline mal ordenado.

## Checklist de domínio

- [ ] Você coloca `$match` e `$project` o mais cedo possível
- [ ] Você explica por que `$lookup` é um join por documento
- [ ] Você sabe quando `$unwind` multiplica o custo e como evitá-lo
- [ ] Você usa `$facet` para múltiplos relatórios na mesma entrada
- [ ] Você reconhece `$group` de alta cardinalidade como risco de memória
- [ ] Você valida o pipeline com `explain` e volume realista

## Para ir além

- [MongoDB — Aggregation Pipeline](https://www.mongodb.com/docs/manual/core/aggregation-pipeline/)
- [MongoDB — $lookup](https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/)
- [MongoDB — $facet](https://www.mongodb.com/docs/manual/reference/operator/aggregation/facet/)
- [MongoDB — Aggregation Pipeline Optimization](https://www.mongodb.com/docs/manual/core/aggregation-pipeline-optimization/)
