> **Em uma frase:** window function calcula um valor por linha sem colapsar o grupo; é a diferença entre “qual o total do mês” e “qual a posição de cada vendedor dentro do mês”.

## O problema

O RH pede o ranking de vendas por região, mas quer manter todas as linhas para ver também o valor de cada vendedor. Um `GROUP BY regiao` não serve: colapsa os vendedores. Fazer um self join com `MAX(valor)` também não resolve empates e fica caro. A ferramenta certa é `RANK() OVER (PARTITION BY regiao ORDER BY valor DESC)`, que calcula uma posição por linha sem eliminar as demais.

Window functions são o recurso que mais separa SQL intermediário de avançado. Elas resolvem ranking, comparação com período anterior, acumulados e percentis — e são fáceis de usar errado quando o frame ou o empate não é considerado.

## Como funciona

A sintaxe geral é `funcao() OVER (PARTITION BY ... ORDER BY ... frame)`. `PARTITION BY` divide as linhas em grupos lógicos; `ORDER BY` define a ordem dentro de cada partição; o frame define quais linhas entram no cálculo para a linha atual. Diferente de `GROUP BY`, a saída mantém uma linha por linha de entrada.

```sql
SELECT v.nome,
       v.regiao,
       s.mes,
       s.valor_centavos,
       RANK() OVER (
           PARTITION BY v.regiao, s.mes
           ORDER BY s.valor_centavos DESC
       ) AS posicao
FROM vendas s
JOIN vendedores v ON v.id = s.vendedor_id
ORDER BY v.regiao, s.mes, posicao;
```

`RANK`, `DENSE_RANK` e `ROW_NUMBER` parecem iguais até haver empate:

| Função | Empate em 1º | Próximo |
|---|---|---|
| `ROW_NUMBER` | 1, 2 ou 1, 1 (arbitrário) | 3 |
| `RANK` | 1, 1 | 3 |
| `DENSE_RANK` | 1, 1 | 2 |

Use `ROW_NUMBER` quando você precisa de exatamente N linhas e pode desempatar por outra coluna (`ORDER BY valor DESC, id`). Use `RANK` quando a pergunta é “quantos estão à frente?” e empates devem compartilhar posição. Use `DENSE_RANK` quando quer posições sem lacunas, como “faixas de preço”.

`LAG` e `LEAD` acessam a linha anterior ou seguinte sem self join:

```sql
WITH mensal AS (
    SELECT vendedor_id,
           date_trunc('month', criado_em)::date AS mes,
           SUM(total_centavos) AS receita
    FROM vendas
    WHERE status = 'pago'
    GROUP BY vendedor_id, 1
)
SELECT vendedor_id,
       mes,
       receita,
       LAG(receita) OVER (PARTITION BY vendedor_id ORDER BY mes) AS receita_anterior,
       receita - LAG(receita) OVER (PARTITION BY vendedor_id ORDER BY mes) AS variacao
FROM mensal
ORDER BY vendedor_id, mes;
```

A CTE primeiro reduz para o grão “vendedor/mês”. A window function então opera nesse grão. Se você aplicar `LAG` diretamente em `vendas`, cada venda será comparada com a venda anterior do mesmo vendedor, não com o mês anterior. O grão vem antes da janela.

### Running total e frames

Um acumulado usa `SUM() OVER (ORDER BY ... ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`. O frame é essencial. Sem `ORDER BY`, a window cobre a partição inteira e `SUM` retorna o total em todas as linhas. Com `ORDER BY` e sem frame explícito, o padrão é `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, que inclui **todas as linhas empatadas** na ordem. Se duas vendas têm o mesmo timestamp, o acumulado pode pular de uma vez.

```sql
SELECT criado_em,
       total_centavos,
       SUM(total_centavos) OVER (
           ORDER BY criado_em, id
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS acumulado_centavos
FROM pedidos
WHERE status = 'pago'
ORDER BY criado_em, id;
```

Colocar `id` no `ORDER BY` remove a ambiguidade entre timestamps iguais. `ROWS` conta linhas físicas; `RANGE` conta valores lógicos e inclui peers. Para séries temporais com possíveis empates, `ROWS` costuma ser o que você quer para um acumulado determinístico.

Também é possível definir a janela uma vez e reutilizar:

```sql
SELECT nome,
       mes,
       receita,
       SUM(receita) OVER w AS acumulado,
       AVG(receita) OVER w AS media_movel
FROM mensal
WINDOW w AS (PARTITION BY vendedor_id ORDER BY mes
             ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
ORDER BY vendedor_id, mes;
```

Aqui `AVG` vira uma média móvel de três meses. Note que o frame `2 PRECEDING` inclui a linha atual; para uma média dos três meses anteriores excluindo o atual, use `3 PRECEDING AND 1 PRECEDING`.

### O plano

Window functions exigem que as linhas estejam ordenadas por partição e ordem. O PostgreSQL pode usar um índice para entregar essa ordem ou插入 um `Sort`. O plano típico:

```text
WindowAgg  (cost=845.20..912.40 rows=5000 width=48) (actual time=12.300..14.100 rows=5000 loops=1)
  ->  Sort  (cost=845.20..857.70 rows=5000 width=48) (actual time=11.800..12.400 rows=5000 loops=1)
        Sort Key: v.regiao, s.mes, s.valor_centavos DESC
        Sort Method: quicksort  Memory: 612kB
        ->  Hash Join  ...
```

Se o `Sort` aparece com `external merge Disk: 128MB`, a janela não coube em `work_mem`. Aumentar `work_mem` na sessão pode resolver, mas o custo de memória é por operação. Um índice em `(regiao, mes, valor_centavos DESC)` pode eliminar o sort, desde que a query use exatamente essa ordem e o planner decida que vale a pena.

No JDBC, window functions são SQL normal; o cuidado está no volume. Se você calcula ranking de milhões de linhas para mostrar 20, empurre o filtro para antes da janela — ou use uma CTE com `ROW_NUMBER` e filtre depois, mas garanta que o filtro externo não obrigue a calcular tudo:

```java
String sql = """
    WITH ranqueado AS (
        SELECT id, nome, receita,
               ROW_NUMBER() OVER (PARTITION BY regiao ORDER BY receita DESC, id) AS rn
        FROM resumo_vendedores
        WHERE mes = ?
    )
    SELECT id, nome, receita
    FROM ranqueado
    WHERE rn <= 10
    ORDER BY receita DESC
    """;

try (Connection conn = dataSource.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setObject(1, LocalDate.parse("2026-03-01"));
    try (ResultSet rs = ps.executeQuery()) {
        while (rs.next()) {
            System.out.printf("%d %s %d%n", rs.getLong("id"), rs.getString("nome"), rs.getLong("receita"));
        }
    }
}
```

O filtro `mes = ?` está dentro da CTE de propósito: reduz o conjunto antes de calcular a janela. Se ele ficasse fora, o banco poderia calcular o ranking de todos os meses para depois descartar quase tudo.

## Na prática

Use window functions para: ranking por grupo, comparação com período anterior, acumulados, médias móveis, percentis (`percent_rank`, `cume_dist`, `ntile`) e preenchimento de lacunas (`first_value`, `last_value`). Não use para substituir `GROUP BY` quando você só quer o total por grupo; a window mantém todas as linhas e pode custar mais.

Um erro comum é tentar filtrar `WHERE rn = 1` na mesma query que define `rn`. `WHERE` é avaliado antes das window functions. Envolva em subquery ou CTE:

```sql
WITH ranked AS (
    SELECT p.*,
           ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY criado_em DESC, id DESC) AS rn
    FROM pedidos p
)
SELECT * FROM ranked WHERE rn = 1;
```

Esse padrão resolve “último pedido por cliente” sem `DISTINCT ON`. O PostgreSQL também tem `DISTINCT ON (cliente_id) ... ORDER BY cliente_id, criado_em DESC`, que costuma ser mais eficiente com índice, mas é uma extensão do PostgreSQL e exige ordem consistente. Escolha pelo plano, não pela preferência.

## Armadilhas comuns

- **Ignorar empates.** `ROW_NUMBER` sem desempate produz resultado não determinístico. Inclua uma coluna única no `ORDER BY`.
- **Frame padrão `RANGE`.** Em running totals com timestamps empatados, o acumulado inclui todos os peers. Use `ROWS` se quer linha a linha.
- **Filtrar window no `WHERE`.** Não é permitido; use CTE/subquery.
- **Calcular a janela em grão errado.** Agregue primeiro, depois aplique `LAG`/`SUM` sobre o grão mensal.

## Checklist de domínio

- [ ] Você diferencia `ROW_NUMBER`, `RANK` e `DENSE_RANK` em empates.
- [ ] Você escreve um running total determinístico com frame `ROWS`.
- [ ] Você usa `LAG`/`LEAD` para comparar períodos sem self join.
- [ ] Você reconhece quando um `Sort` no plano é inevitável e quando um índice pode eliminá-lo.

## Para ir além

- [PostgreSQL 16 — Window Functions](https://www.postgresql.org/docs/16/tutorial-window.html): tutorial oficial com ranking, frames e partições.
- [PostgreSQL 16 — Window Function Calls](https://www.postgresql.org/docs/16/sql-expressions.html#SYNTAX-WINDOW-FUNCTIONS): sintaxe de `OVER`, `PARTITION BY` e frames.
- [Use The Index, Luke — Window Functions](https://use-the-index-luke.com/sql/partial-results/window-functions): como índices interagem com janelas.
