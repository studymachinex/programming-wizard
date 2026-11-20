> **Em uma frase:** subquery e CTE não são “queries dentro de queries”; são formas de compor conjuntos, e o planner só as trata bem quando você entende se elas serão inline, materializadas ou executadas por linha.

## O problema

A lista de clientes precisa excluir quem já comprou. A primeira versão usa `WHERE id NOT IN (SELECT cliente_id FROM pedidos)`. Em produção, a lista fica vazia. O time investiga e descobre que existe um pedido com `cliente_id NULL` — um dado antigo, de uma importação. `NOT IN` com NULL não retorna “os que não estão”; retorna nada, porque a comparação vira `UNKNOWN` para todas as linhas.

Outro caso: um relatório usa uma CTE gigante e roda em 40 segundos. Ao reescrever a mesma lógica como subquery, cai para 2 segundos. A diferença não é mágica: no PostgreSQL 12+, CTEs não recursivas podem ser inline, mas certas construções forçam materialização. Saber quando isso acontece é parte de escrever SQL previsível.

## Como funciona

Subqueries aparecem em quatro lugares principais: no `SELECT` (escalar), no `FROM` (derivada), no `WHERE` (`IN`, `EXISTS`, comparações) e no `HAVING`. Cada uma tem semântica e custo diferentes.

Uma **subquery escalar** retorna no máximo uma linha e uma coluna. Se retornar mais de uma linha, a query falha em runtime. Se retornar zero, o resultado é `NULL`:

```sql
SELECT p.id,
       p.total_centavos,
       (SELECT c.nome FROM clientes c WHERE c.id = p.cliente_id) AS cliente
FROM pedidos p
WHERE p.status = 'pago';
```

Esse padrão é legível, mas o planner pode executar a subquery uma vez por linha. Com índice em `clientes.id`, cada execução é barata; sem índice, é um desastre. Muitas vezes um `JOIN` é melhor porque permite hash join e reduz o número de execuções.

**`IN`** compara um valor com um conjunto. **`EXISTS`** testa se a subquery retorna pelo menos uma linha. Para anti-join, `NOT EXISTS` é seguro com NULL; `NOT IN` não é. Compare:

```sql
-- Pode retornar vazio se houver cliente_id NULL na subquery
SELECT c.id, c.nome
FROM clientes c
WHERE c.id NOT IN (SELECT p.cliente_id FROM pedidos p);

-- Seguro: não depende de NULL
SELECT c.id, c.nome
FROM clientes c
WHERE NOT EXISTS (
    SELECT 1 FROM pedidos p WHERE p.cliente_id = c.id
);
```

O `NOT EXISTS` costuma virar um `Hash Anti Join` ou `Nested Loop Anti Join`:

```text
Hash Anti Join  (cost=12.00..38.50 rows=120 width=32) (actual time=0.180..0.420 rows=118 loops=1)
  Hash Cond: (c.id = p.cliente_id)
  ->  Seq Scan on clientes c  (cost=0.00..12.00 rows=500 width=32)
  ->  Hash  (cost=8.00..8.00 rows=300 width=8) (actual time=0.080..0.081 rows=300 loops=1)
        ->  Seq Scan on pedidos p  (cost=0.00..8.00 rows=300 width=8)
```

Já o `NOT IN` com NULL pode aparecer como `SubPlan` com uma condição de nulidade, ou ser otimizado para anti join quando o planner consegue provar que a coluna é `NOT NULL`. A lição: não dependa de uma otimização que só vale sob certas constraints. Se a coluna é `NOT NULL`, declare isso; se não é, use `NOT EXISTS`.

**Subqueries correlacionadas** referenciam a query externa. Um exemplo clássico é buscar o último pedido de cada cliente:

```sql
SELECT c.id, c.nome,
       (SELECT p.criado_em
        FROM pedidos p
        WHERE p.cliente_id = c.id
        ORDER BY p.criado_em DESC, p.id DESC
        LIMIT 1) AS ultimo_pedido
FROM clientes c;
```

Com índice em `(cliente_id, criado_em DESC, id DESC)`, cada execução lê uma linha; para 10 mil clientes, são 10 mil buscas de índice. Funciona, mas `LATERAL` costuma ser mais explícito e permite retornar várias colunas:

```sql
SELECT c.id, c.nome, ultimo.id AS pedido_id, ultimo.total_centavos
FROM clientes c
LEFT JOIN LATERAL (
    SELECT p.id, p.total_centavos
    FROM pedidos p
    WHERE p.cliente_id = c.id
    ORDER BY p.criado_em DESC, p.id DESC
    LIMIT 1
) AS ultimo ON true;
```

`LATERAL` é como um `for each` no `FROM`: a subquery pode referenciar colunas das tabelas anteriores. O `LEFT JOIN LATERAL ... ON true` preserva clientes sem pedido. Sem o `LEFT`, clientes sem pedido desaparecem.

### CTEs e materialização

`WITH` nomeia um conjunto e melhora a legibilidade. No PostgreSQL 12+, uma CTE não recursiva referenciada uma vez pode ser integrada à query principal, como se fosse uma subquery. Isso permite que predicados externos desçam para dentro e índices sejam usados. Você pode forçar a materialização:

```sql
WITH vendas_mes AS MATERIALIZED (
    SELECT date_trunc('month', criado_em)::date AS mes,
           SUM(total_centavos) AS receita
    FROM pedidos
    WHERE status = 'pago'
    GROUP BY 1
)
SELECT mes, receita,
       receita - LAG(receita) OVER (ORDER BY mes) AS variacao
FROM vendas_mes
ORDER BY mes;
```

`MATERIALIZED` calcula a CTE uma vez e guarda o resultado. Isso é útil se a CTE é cara e referenciada várias vezes, ou se você precisa de um “optimization fence” para estabilizar o plano. O custo é que predicados externos não são empurrados para dentro; a CTE pode ler mais linhas do que o necessário. `NOT MATERIALIZED` faz o oposto: força a integração, quando o planner decide materializar por conta própria.

Uma CTE recursiva é diferente: ela sempre é materializada e executada em iterações. É a ferramenta para hierarquias, mas pode entrar em loop se os dados tiverem ciclos. Veremos isso em um exercício.

No JDBC, subqueries e CTEs não mudam a API, mas exigem cuidado com parâmetros repetidos. Se a mesma CTE usa `?` duas vezes, o driver pode exigir dois `set` — ou você pode usar `WITH params AS (SELECT ?::bigint AS cliente_id)` para nomear o valor:

```java
String sql = """
    WITH alvo AS (
        SELECT ?::bigint AS cliente_id
    )
    SELECT p.id, p.total_centavos
    FROM pedidos p
    JOIN alvo a ON a.cliente_id = p.cliente_id
    WHERE p.status = 'pago'
    ORDER BY p.criado_em DESC
    LIMIT 20
    """;

try (Connection conn = dataSource.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setLong(1, 42L);
    try (ResultSet rs = ps.executeQuery()) {
        while (rs.next()) {
            System.out.println(rs.getLong("id") + " " + rs.getLong("total_centavos"));
        }
    }
}
```

## Na prática

Use CTE quando ela nomeia uma etapa e reduz duplicação; use subquery quando o escopo é local e descartável. Não use CTE apenas para “parecer moderno”: se ela é referenciada uma vez e não precisa de materialização, a subquery pode gerar o mesmo plano com menos cerimônia.

Para diagnosticar, sempre olhe o plano. Se você esperava um `Hash Join` e encontrou um `SubPlan` com `loops=50000`, a subquery está sendo executada por linha. Se esperava um `Index Scan` e encontrou `CTE Scan` com `rows=2000000` seguido de filtro, a CTE materializada está impedindo o pushdown. A solução pode ser `NOT MATERIALIZED`, reescrever como join ou mover o filtro para dentro da CTE.

## Armadilhas comuns

- **`NOT IN` com subquery nullable.** Retorna vazio se houver NULL. Use `NOT EXISTS`.
- **Subquery escalar que retorna mais de uma linha.** Falha em runtime; o compilador não sabe. Garanta `LIMIT 1` ou uma chave única.
- **CTE como caixa-preta.** `MATERIALIZED` pode parecer seguro, mas impede otimizações. Meça antes e depois.
- **`LATERAL` sem índice no lado interno.** Vira um nested loop caro, executado uma vez por linha externa.

## Checklist de domínio

- [ ] Você escolhe entre `IN`, `EXISTS` e join com base em NULL e cardinalidade.
- [ ] Você explica quando uma CTE é inline ou materializada no PostgreSQL 16.
- [ ] Você usa `LATERAL` para top-N por grupo sem duplicar linhas.
- [ ] Você lê um plano e identifica `SubPlan`, `CTE Scan` e `Hash Anti Join`.

## Para ir além

- [PostgreSQL 16 — WITH Queries](https://www.postgresql.org/docs/16/queries-with.html): CTEs, recursão e regras de materialização.
- [PostgreSQL 16 — Subquery Expressions](https://www.postgresql.org/docs/16/functions-subquery.html): `EXISTS`, `IN`, `ANY` e `ALL`.
- [PostgreSQL 16 — LATERAL Subqueries](https://www.postgresql.org/docs/16/queries-table-expressions.html#QUERIES-LATERAL): semântica e exemplos.
