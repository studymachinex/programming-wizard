> **Em uma frase:** agregação responde “por grupo” e não “por linha”; escolher o grão e a função certa é o que separa um dashboard confiável de uma planilha com números plausíveis.

## O problema

O time de produto pergunta: “qual a média de valor por pedido em cada categoria?”. A primeira resposta junta pedidos e itens, agrupa por categoria e calcula `AVG(pedidos.total_centavos)`. O número parece baixo: pedidos com muitos itens pesam igual a pedidos com um item, e cada pedido é repetido por item. A segunda tentativa calcula `AVG(AVG(...))` em uma subquery, o que também está errado: é a média das médias, não a média ponderada pelo volume.

`GROUP BY` não é difícil por causa da sintaxe. É difícil porque exige decidir, antes de tudo, o que uma linha representa. Depois dessa decisão, `COUNT`, `SUM` e `AVG` passam a ter significado.

## Como funciona

`GROUP BY` particiona as linhas em grupos que compartilham os mesmos valores nas colunas listadas. Cada grupo produz uma linha de saída. As colunas do `SELECT` que não estão em uma função de agregação precisam estar no `GROUP BY` — o PostgreSQL rejeita o contrário, o que é uma proteção, não uma limitação.

```sql
SELECT p.status,
       COUNT(*)                         AS pedidos,
       COUNT(*) FILTER (WHERE p.total_centavos > 10000) AS acima_de_100,
       SUM(p.total_centavos)            AS total_centavos,
       ROUND(AVG(p.total_centavos), 2)  AS ticket_medio_centavos
FROM pedidos AS p
WHERE p.criado_em >= TIMESTAMPTZ '2026-01-01 00:00:00-03'
  AND p.criado_em <  TIMESTAMPTZ '2026-04-01 00:00:00-03'
GROUP BY p.status
ORDER BY total_centavos DESC;
```

`FILTER (WHERE ...)` é uma extensão do PostgreSQL — e do padrão SQL — que aplica a agregação apenas às linhas que satisfazem o predicado, sem precisar de `CASE`. É mais legível que `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` e costuma ter plano equivalente. Use quando quiser várias métricas no mesmo grão.

`COUNT(*)` conta linhas, incluindo linhas com `NULL`. `COUNT(coluna)` ignora `NULL`. `COUNT(DISTINCT coluna)` conta valores distintos não nulos. Essa distinção é a origem de muitos relatórios errados:

| Expressão | Conta |
|---|---|
| `COUNT(*)` | Todas as linhas do grupo |
| `COUNT(p.id)` | Linhas em que `p.id` não é NULL |
| `COUNT(DISTINCT p.cliente_id)` | Clientes distintos com `p.id` não nulo |
| `SUM(p.total_centavos)` | Soma dos valores, ignorando NULL |

Em um `LEFT JOIN`, `COUNT(*)` conta a linha “vazia” do cliente sem pedido; `COUNT(p.id)` retorna zero para ele. Para “quantos clientes têm pelo menos um pedido pago”, a expressão correta é `COUNT(DISTINCT p.cliente_id) FILTER (WHERE p.status = 'pago')`.

`WHERE` e `HAVING` atuam em momentos diferentes. `WHERE` filtra linhas antes de agrupar; `HAVING` filtra grupos depois. Se o filtro não depende de uma agregação, ele pertence ao `WHERE` — mesmo que o resultado final seja o mesmo, o plano fica menor. `HAVING COUNT(*) >= 10` só pode existir depois da contagem.

```sql
SELECT c.cidade, COUNT(*) AS clientes_ativos
FROM clientes AS c
WHERE c.criado_em < TIMESTAMPTZ '2026-01-01 00:00:00-03'
GROUP BY c.cidade
HAVING COUNT(*) >= 100
ORDER BY clientes_ativos DESC;
```

`GROUP BY` trata `NULL` como um grupo. Se `cidade` é nullable, todos os clientes sem cidade formam uma linha com `cidade = NULL`. Isso pode ser aceitável, mas precisa ser uma decisão. Em relatórios, muitas vezes o correto é `WHERE cidade IS NOT NULL` ou `COALESCE(cidade, '(sem cidade)')`.

Para múltiplas dimensões, `GROUPING SETS`, `ROLLUP` e `CUBE` evitamUNIONs gigantes. `ROLLUP (categoria, mes)` produz subtotais por categoria e o total geral; `CUBE` produz todas as combinações. O espaço amostral cresce rápido, então use com consciência:

```sql
SELECT categoria,
       date_trunc('month', criado_em)::date AS mes,
       SUM(total_centavos) AS receita_centavos
FROM pedidos
WHERE status = 'pago'
GROUP BY ROLLUP (categoria, date_trunc('month', criado_em))
ORDER BY categoria NULLS LAST, mes NULLS LAST;
```

As linhas de subtotal têm `NULL` nas colunas agrupadas. Para distinguir “subtotal” de “valor realmente nulo”, use `GROUPING(categoria)`, que retorna 1 quando a coluna foi agregada pelo `ROLLUP`.

O plano de uma agregação pode ser `HashAggregate` ou `GroupAggregate`. O primeiro constrói uma tabela hash dos grupos; o segundo exige entrada ordenada e percorre grupos consecutivos. Em uma tabela de 2 milhões de pedidos, agrupar por status (3 valores) tende a `HashAggregate` com pouca memória. Agrupar por `date_trunc('month', criado_em)` e ordenar pode usar `GroupAggregate` se houver índice na expressão.

```text
HashAggregate  (cost=91234.00..91234.12 rows=3 width=40) (actual time=812.400..812.410 rows=3 loops=1)
  Group Key: status
  Batches: 1  Memory Usage: 24kB
  ->  Seq Scan on pedidos  (cost=0.00..78400.00 rows=2000000 width=16)
```

Se a hash não couber em `work_mem`, aparecem `Batches: 4` e derramamento para disco. Aumentar `work_mem` globalmente é uma armadilha: cada operação pode consumir esse valor, e muitas conexões simultâneas podem estourar a RAM. Prefira ajustar por sessão ou por query.

No JDBC, uma agregação retorna poucas linhas, mas o tipo de `SUM(bigint)` é `numeric` — e pode não caber em `long`:

```java
String sql = """
    SELECT status,
           COUNT(*) AS pedidos,
           SUM(total_centavos) AS total_centavos
    FROM pedidos
    WHERE criado_em >= ? AND criado_em < ?
    GROUP BY status
    ORDER BY total_centavos DESC
    """;

try (Connection conn = dataSource.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setObject(1, OffsetDateTime.parse("2026-01-01T00:00:00-03:00"));
    ps.setObject(2, OffsetDateTime.parse("2026-04-01T00:00:00-03:00"));

    try (ResultSet rs = ps.executeQuery()) {
        while (rs.next()) {
            System.out.printf("%s: %d pedidos, %s centavos%n",
                rs.getString("status"),
                rs.getLong("pedidos"),
                rs.getBigDecimal("total_centavos"));
        }
    }
}
```

Use `getBigDecimal` para somas monetárias. `getLong` funciona enquanto o valor couber em 64 bits, mas o contrato do `SUM` é `numeric`; ler como `long` é uma conversão silenciosa que pode estourar em relatórios anuais.

## Na prática

Um painel de vendas costuma ter três grãos ao mesmo tempo: pedido, item e cliente. Não tente produzi-los em um único `GROUP BY` sem saber o que está multiplicando. Separe em CTEs nomeadas pelo grão (`pedidos_por_cliente`, `itens_por_pedido`) e junte os resultados já agregados. O SQL fica maior, mas cada número tem uma definição.

Para médias, prefira a média ponderada quando os grupos têm tamanhos diferentes:

```sql
-- Média correta: receita total dividida pelo número total de pedidos
SELECT categoria,
       SUM(total_centavos)::numeric / NULLIF(COUNT(*), 0) AS ticket_medio
FROM pedidos
WHERE status = 'pago'
GROUP BY categoria;
```

`NULLIF(COUNT(*), 0)` evita divisão por zero quando o grupo está vazio — embora um grupo vazio nem apareça no resultado. Ainda assim, é um hábito útil em expressões que podem receber zero de uma subquery.

## Armadilhas comuns

- **Selecionar coluna fora do `GROUP BY`.** O PostgreSQL moderno rejeita; em bancos permissivos, o valor é arbitrário. Não dependa de “funcionar”.
- **`HAVING` para filtro de linha.** `HAVING status = 'pago'` é válido se `status` estiver agrupado, mas é semanticamente confuso. Filtre no `WHERE`.
- **`AVG` de valores já agregados.** Média de médias não é média geral. Pondere ou recalcule a partir do grão original.
- **Esquecer o `NULL` como grupo.** Relatórios com “cidade em branco” muitas vezes são um `GROUP BY` que não tratou ausência.

## Checklist de domínio

- [ ] Você define o grão de uma agregação antes de escolher as funções.
- [ ] Você explica a diferença entre `COUNT(*)`, `COUNT(coluna)` e `COUNT(DISTINCT coluna)`.
- [ ] Você usa `FILTER` para múltiplas métricas no mesmo grupo.
- [ ] Você reconhece quando `ROLLUP` ou `GROUPING SETS` substituem vários `UNION ALL`.

## Para ir além

- [PostgreSQL 16 — Aggregate Functions](https://www.postgresql.org/docs/16/functions-aggregate.html): lista completa, incluindo `FILTER`, `percentile_cont` e `string_agg`.
- [PostgreSQL 16 — GROUP BY and GROUPING SETS](https://www.postgresql.org/docs/16/queries-table-expressions.html#QUERIES-GROUPING-SETS): sintaxe de `ROLLUP`, `CUBE` e `GROUPING SETS`.
- [Use The Index, Luke — Aggregation](https://use-the-index-luke.com/sql/aggregation): como índices e ordenação afetam agregações.
