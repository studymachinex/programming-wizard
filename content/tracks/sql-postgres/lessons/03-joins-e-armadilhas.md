> **Em uma frase:** join não “junta tabelas”, ele multiplica conjuntos segundo uma condição; quem não controla a cardinalidade do resultado começa a somar o mesmo dinheiro várias vezes.

## O problema

O relatório de receita por cliente mostra a Ana com R$ 1.240, mas ela fez três pedidos que somam R$ 620. O desenvolvedor conferiu os pedidos, conferiu os valores e não achou erro. O join com `itens_pedido` duplicou cada pedido por item; depois, um `LEFT JOIN` com `pagamentos` duplicou de novo por tentativa de pagamento. O `SUM` fez exatamente o que foi pedido: somou todas as linhas de um conjunto que já não tinha o grão de pedido.

Join é a operação mais poderosa e mais perigosa do SQL. A pergunta central nunca é “qual o tipo de join?”, mas “quantas linhas cada lado produz e quantas sobrevivem à condição?”. Sem essa resposta, `INNER`, `LEFT` e `FULL` são só palavras.

## Como funciona

Um join combina linhas de duas relações sempre que a condição é verdadeira. O `INNER JOIN` mantém apenas combinações com correspondência nos dois lados. O `LEFT JOIN` mantém todas as linhas da esquerda, preenchendo com `NULL` as colunas da direita quando não há correspondência. O `RIGHT JOIN` é o espelho — e quase sempre pode ser reescrito como `LEFT`, o que facilita a leitura. O `FULL JOIN` mantém os dois lados, com `NULL` onde faltar correspondência.

Com o schema do marketplace:

```sql
-- Todos os clientes, com ou sem pedidos pagos
SELECT c.id, c.nome, COUNT(p.id) AS pedidos_pagos
FROM clientes AS c
LEFT JOIN pedidos AS p
       ON p.cliente_id = c.id
      AND p.status = 'pago'
GROUP BY c.id, c.nome
ORDER BY pedidos_pagos DESC, c.nome;
```

A condição `p.status = 'pago'` está no `ON`, não no `WHERE`. Isso é deliberado: no `ON`, ela controla quais linhas do lado direito contam como correspondência; clientes sem pedido pago continuam na saída com `COUNT(p.id) = 0`. Se a condição fosse para o `WHERE`, as linhas sem correspondência teriam `p.status = NULL`, o filtro as descartaria e o `LEFT JOIN` viraria um `INNER JOIN` disfarçado.

Esse é o erro mais comum com joins externos. A regra prática: **filtros que restringem o lado preservado ficam no `WHERE`; filtros que restringem apenas o lado opcional ficam no `ON`**. Quando os dois lados são obrigatórios, tanto faz — mas seja consistente.

A cardinalidade é o segundo ponto. Se cada pedido tem vários itens, juntar `pedidos` e `itens_pedido` produz uma linha por item. `SUM(p.total_centavos)` passa a somar o total do pedido uma vez por item. Para contar pedidos, use `COUNT(DISTINCT p.id)`; para somar receita de itens, use `SUM(i.quantidade * i.preco_unitario_centavos)`, que está no grão certo. As duas métricas podem coexistir, desde que você saiba o que cada uma representa:

```sql
SELECT c.nome,
       COUNT(DISTINCT p.id)                              AS pedidos,
       COALESCE(SUM(i.quantidade * i.preco_unitario_centavos), 0) AS receita_itens_centavos
FROM clientes AS c
LEFT JOIN pedidos AS p
       ON p.cliente_id = c.id AND p.status = 'pago'
LEFT JOIN itens_pedido AS i
       ON i.pedido_id = p.id
GROUP BY c.id, c.nome
ORDER BY receita_itens_centavos DESC;
```

O PostgreSQL tem três algoritmos principais de join. O **Nested Loop** percorre o lado externo e, para cada linha, busca no lado interno; é ótimo quando o lado externo é pequeno e o interno tem índice. O **Hash Join** constrói uma tabela hash do lado menor e varre o maior; brilha em grandes volumes sem índice adequado. O **Merge Join** ordena os dois lados e os percorre em paralelo; é útil quando ambos já estão ordenados por índice.

Um plano realista para clientes e pedidos:

```text
Hash Join  (cost=18.50..92.30 rows=980 width=40) (actual time=0.220..1.410 rows=1000 loops=1)
  Hash Cond: (p.cliente_id = c.id)
  ->  Seq Scan on pedidos p  (cost=0.00..58.00 rows=3200 width=16)
        Filter: (status = 'pago'::text)
        Rows Removed by Filter: 1800
  ->  Hash  (cost=12.00..12.00 rows=500 width=32) (actual time=0.180..0.181 rows=500 loops=1)
        Buckets: 1024  Batches: 1  Memory Usage: 39kB
        ->  Seq Scan on clientes c  (cost=0.00..12.00 rows=500 width=32)
```

Leia de baixo para cima: duas varreduras, uma hash de 39 kB, e o join. `Batches: 1` indica que a hash coube em memória; se aparecer `Batches: 8` e `Memory Usage` limitado, parte da hash foi para disco e o custo sobe. `rows=980` é estimativa; `rows=1000` é o real. A diferença é pequena aqui, mas em produção uma estimativa de 10 contra 500 mil muda o algoritmo escolhido.

`USING (coluna)` e `NATURAL JOIN` parecem elegantes, mas escondem a condição. `NATURAL JOIN` usa todas as colunas de mesmo nome; se alguém adicionar `criado_em` nas duas tabelas, o join muda de significado sem erro de sintaxe. Prefira `ON` explícito. Para self joins, use aliases distintos e condições claras:

```sql
-- Pares de clientes na mesma cidade, sem repetir o par invertido
SELECT a.nome AS cliente_a, b.nome AS cliente_b, a.cidade
FROM clientes AS a
JOIN clientes AS b
  ON b.cidade = a.cidade
 AND b.id > a.id
ORDER BY a.cidade, a.nome, b.nome;
```

A condição `b.id > a.id` evita `(Ana, Bruno)` e `(Bruno, Ana)` e também exclui o par de uma linha consigo mesma. Sem ela, o self join produz o quadrado da tabela.

No JDBC, um join com muitos resultados precisa de `fetchSize` para não carregar tudo na memória do driver:

```java
String sql = """
    SELECT c.nome, COUNT(DISTINCT p.id) AS pedidos
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.status = ?
    GROUP BY c.id, c.nome
    ORDER BY pedidos DESC
    """;

try (Connection conn = dataSource.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, "pago");
    ps.setFetchSize(500);

    try (ResultSet rs = ps.executeQuery()) {
        while (rs.next()) {
            System.out.printf("%s: %d%n", rs.getString("nome"), rs.getInt("pedidos"));
        }
    }
}
```

`setFetchSize` é uma dica para o driver; com autocommit e certos drivers, ele pode ser ignorado. Para streaming real, às vezes é preciso desligar autocommit ou usar cursor nomeado. Meça, não presuma.

## Na prática

Antes de escrever um join, conte as linhas das duas pontas e verifique a unicidade da chave de junção. Se o lado direito pode ter mais de uma linha por chave, o resultado terá fan-out. Documente isso na query com um comentário ou, melhor, com uma métrica separada.

Para relatórios financeiros, uma técnica útil é agregar cada tabela no seu grão antes de juntar:

```sql
WITH pedidos_pagos AS (
    SELECT cliente_id, COUNT(*) AS qtd, SUM(total_centavos) AS total
    FROM pedidos
    WHERE status = 'pago'
    GROUP BY cliente_id
),
itens_por_pedido AS (
    SELECT pedido_id, SUM(quantidade) AS unidades
    FROM itens_pedido
    GROUP BY pedido_id
)
SELECT c.nome,
       COALESCE(pp.qtd, 0) AS pedidos,
       COALESCE(pp.total, 0) AS receita_centavos,
       COALESCE(SUM(ip.unidades), 0) AS unidades
FROM clientes c
LEFT JOIN pedidos_pagos pp ON pp.cliente_id = c.id
LEFT JOIN itens_por_pedido ip ON ip.pedido_id = pp.pedido_id
GROUP BY c.id, c.nome, pp.qtd, pp.total;
```

Aqui a agregação acontece antes do join, então não há multiplicação entre pedidos e itens. O custo é mais trabalho de agregação e maior uso de memória temporária; o benefício é um número que fecha.

## Armadilhas comuns

- **Filtro do lado opcional no `WHERE`.** Transforma `LEFT JOIN` em `INNER JOIN` e remove clientes sem pedidos.
- **`COUNT(*)` após join com itens.** Conta linhas do produto, não pedidos. Use `COUNT(DISTINCT pedidos.id)` ou agregue antes.
- **Join em coluna não única.** Um e-mail duplicado ou uma categoria repetida multiplica linhas silenciosamente.
- **`NATURAL JOIN` em schema evolutivo.** Uma coluna nova com o mesmo nome muda a condição de junção sem aviso.

## Checklist de domínio

- [ ] Você explica a diferença entre colocar um filtro no `ON` e no `WHERE` de um `LEFT JOIN`.
- [ ] Você identifica fan-out antes de somar valores.
- [ ] Você escolhe entre Nested Loop, Hash Join e Merge Join com base em volume e índices.
- [ ] Você reescreve um `RIGHT JOIN` como `LEFT JOIN` sem mudar o resultado.

## Para ir além

- [PostgreSQL 16 — Joined Tables](https://www.postgresql.org/docs/16/queries-table-expressions.html#QUERIES-JOIN): semântica de `INNER`, `LEFT`, `RIGHT`, `FULL` e `CROSS`.
- [PostgreSQL 16 — Planner/Optimizer](https://www.postgresql.org/docs/16/planner-optimizer.html): como o planejador escolhe algoritmos de join.
- [Use The Index, Luke — Join Strategies](https://use-the-index-luke.com/sql/join): explicação prática de nested loop, hash e merge join.
