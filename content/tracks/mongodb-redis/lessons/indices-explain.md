> **Em uma frase:** índice é uma decisão de acesso; sem `explain` você está adivinhando se o banco usou o atalho certo ou varreu a coleção inteira.

## O problema

Uma listagem de pedidos demora 2,4 segundos. O time cria um índice para cada campo do filtro — `tenantId`, `status`, `criadoEm`, `valor` — e a query continua lenta. Pior: as escritas ficaram mais caras. O `explain` mostra `COLLSCAN` porque nenhum índice isolado satisfaz o filtro composto e a ordenação ao mesmo tempo.

Índice não é "adicionar até parar de doer". É desenhar a estrutura que o padrão de acesso percorre: igualdade primeiro, ordenação depois, intervalo por último. E provar com o plano de execução.

## Como funciona

O MongoDB usa índices B-tree. Um índice composto `{a: 1, b: 1, c: -1}` ordena por `a`, depois `b`, depois `c`. Isso cria a regra do prefixo: o índice serve consultas por `a`, por `a+b`, por `a+b+c` e ordenações por `a` ou `a+b`; não serve para filtrar só por `b`.

A regra **ESR** organiza os campos:

| Posição | Tipo | Papel |
|---|---|---|
| 1 | Equality | reduz o índice a um intervalo contíguo |
| 2 | Sort | preserva a ordem dentro da igualdade, evitando sort em memória |
| 3 | Range | último, porque o intervalo quebra a ordenação seguinte |

Exemplo: `tenantId = ?`, `status = ?`, `sort({criadoEm: -1})`, `valor >= ?`. O índice correto é `{tenantId: 1, status: 1, criadoEm: -1, valor: 1}`. Inverter `criadoEm` e `valor` faz o servidor ler todos os valores do intervalo e ordenar depois.

Cardinalidade importa, mas não é tudo. Um índice isolado em `status` (dois valores) é quase inútil: metade da coleção casa. Em um índice composto, um campo de baixa cardinalidade pode vir primeiro desde que seja igualdade e os campos seguintes tenham boa seletividade.

**Stages do explain.** `COLLSCAN` é varredura completa. `IXSCAN` é busca no índice. `FETCH` busca o documento depois do índice; é normal, mas caro se muitos documentos passam. `SORT` significa ordenação em memória — o índice não cobriu o sort, e o limite é 32 MB. `PROJECTION_COVERED` indica que todos os campos pedidos estavam no índice.

As métricas decisivas são `totalKeysExamined`, `totalDocsExamined` e `nReturned`. Se `docsExamined` é próximo de `nReturned`, o índice foi seletivo. Se `keysExamined` é enorme para poucos retornados, o intervalo do índice é amplo demais.

```java
package com.exemplo.indices;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import java.util.concurrent.TimeUnit;
import org.bson.Document;

public final class IndicesPedido {

    private IndicesPedido() {
    }

    public static void criar(MongoCollection<Document> pedidos) {
        // ESR: Equality (tenantId, status), Sort (criadoEm), Range (valor).
        pedidos.createIndex(
                Indexes.compoundIndex(
                        Indexes.ascending("tenantId"),
                        Indexes.ascending("status"),
                        Indexes.descending("criadoEm"),
                        Indexes.ascending("valor")),
                new IndexOptions().name("esr_tenant_status_data_valor"));

        // Índice parcial: só pedidos abertos entram; menor e mais barato de manter.
        pedidos.createIndex(
                Indexes.ascending("clienteId"),
                new IndexOptions()
                        .name("cliente_abertos")
                        .partialFilterExpression(Filters.eq("status", "ABERTO")));

        // TTL: o monitor apaga expirados periodicamente, não no milissegundo exato.
        pedidos.createIndex(
                Indexes.ascending("expiraEm"),
                new IndexOptions().name("ttl_pedidos").expireAfter(0, TimeUnit.SECONDS));
    }
}
```

```java
package com.exemplo.indices;

import com.mongodb.ExplainVerbosity;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Sorts;
import org.bson.Document;

public final class PlanoDeConsulta {

    private PlanoDeConsulta() {
    }

    public static void inspecionar(MongoCollection<Document> pedidos, String tenantId) {
        Document explain = pedidos.find(Filters.and(
                        Filters.eq("tenantId", tenantId),
                        Filters.eq("status", "ABERTO"),
                        Filters.gte("valor", 100)))
                .sort(Sorts.descending("criadoEm"))
                .explain(ExplainVerbosity.EXECUTION_STATS);

        Document stats = explain.get("executionStats", Document.class);
        Document raiz = stats.get("executionStages", Document.class);

        System.out.printf("plano=%s docs=%d chaves=%d retornados=%d%n",
                arvore(raiz),
                ((Number) stats.get("totalDocsExamined")).longValue(),
                ((Number) stats.get("totalKeysExamined")).longValue(),
                ((Number) stats.get("nReturned")).longValue());
    }

    private static String arvore(Document stage) {
        String nome = stage.getString("stage");
        Document input = stage.get("inputStage", Document.class);
        return input == null ? nome : nome + " <- " + arvore(input);
    }
}
```

## Na prática

Antes de criar o índice, escreva a query como ela chega em produção — com todos os filtros, o sort e a projeção. O índice nasce dessa query, não do modelo de dados. Depois rode `explain("executionStats")` em um ambiente com volume parecido; em coleção de teste com 500 documentos, todo plano parece bom.

Índices parciais resolvem o caso "só consulto pedidos abertos". O índice fica menor, cabe mais na RAM e custa menos em cada insert. A contrapartida: a query precisa incluir o filtro do índice parcial (`status: "ABERTO"`), senão o otimizador não o considera.

TTL não é agendador de negócio. O monitor roda a cada 60 segundos e a remoção consome I/O; um documento pode viver além do TTL. Para "expira em 15 minutos" de sessão, filtre também por `expiraEm` na leitura.

Construa índices grandes em janela controlada e acompanhe a replicação. Em réplica set, a construção ocorre em todos os membros; em coleção enorme, o impacto de I/O e de cache é real. `hint` serve para testar hipóteses, não para produção: ele congela o plano e impede o otimizador de se adaptar.

## Armadilhas comuns

- **Um índice por campo.** O otimizador escolhe um; o filtro composto continua caro. Desenhe o composto.
- **Ordem ESR errada.** Range antes de sort força `SORT` em memória. Igualdade, sort, range.
- **Índice em campo booleano isolado.** Baixa seletividade; quase sempre é melhor compor.
- **`$regex` não ancorada.** `/termo/` não usa o índice; `^termo` usa o prefixo.
- **Achar que TTL é exato.** O documento expira "em algum momento depois"; não use como verdade temporal.
- **Índice parcial sem o filtro na query.** O plano não o enxerga.
- **Excesso de índices.** Cada escrita atualiza todos; RAM e latência pagam a conta.
- **`explain` só com `queryPlanner`.** Ele mostra a escolha, não o custo real. Use `executionStats` com volume representativo.

## Checklist de domínio

- [ ] Você monta um índice composto na ordem ESR a partir da query
- [ ] Você explica a regra do prefixo e por que `{b}` não usa `{a,b}`
- [ ] Você lê `IXSCAN`, `FETCH`, `SORT` e `COLLSCAN` no plano
- [ ] Você compara `docsExamined` com `nReturned` para julgar seletividade
- [ ] Você usa índice parcial e TTL para problemas diferentes de busca
- [ ] Você mede o custo do índice nas escritas antes de adicionar mais um

## Para ir além

- [MongoDB — Indexes](https://www.mongodb.com/docs/manual/indexes/)
- [MongoDB — Analyze Query Performance](https://www.mongodb.com/docs/manual/tutorial/analyze-query-plan/)
- [MongoDB — Explain Results](https://www.mongodb.com/docs/manual/reference/explain-results/)
- [MongoDB — TTL Indexes](https://www.mongodb.com/docs/manual/core/index-ttl/)
