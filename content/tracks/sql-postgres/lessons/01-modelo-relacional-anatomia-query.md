> **Em uma frase:** SQL é um contrato declarativo sobre conjuntos; entender a ordem lógica e o grão dos dados evita 80% das queries que “funcionam” mas respondem a pergunta errada.

## O problema

Você recebe um ticket: “o dashboard de pedidos mostra R$ 48 mil, mas o financeiro fechou em R$ 39 mil”. A query existe, roda em 200 ms, tem `JOIN`, `GROUP BY` e até um `LIMIT`. Ninguém sabe por que os números divergem. O problema raramente é sintaxe. Quase sempre é uma decisão invisível: o grão do resultado, uma linha multiplicada por um join ou um filtro aplicado no lugar errado.

Antes de decorar funções, é preciso entender o que o PostgreSQL acha que você pediu. Ele não executa a query na ordem em que você escreveu. Ele transforma seu `SELECT` em uma árvore de operadores — varreduras, joins, agregações, ordenações — e escolhe o caminho de menor custo estimado. Se o seu modelo mental for “o banco lê de cima para baixo”, você vai depurar no lugar errado.

## Como funciona

No modelo relacional, uma **relação** é um conjunto de tuplas com atributos tipados. Conjunto importa: não existe “primeira linha” sem uma ordenação explícita. A tabela física é uma implementação; a relação é o contrato lógico. Quando você escreve `SELECT nome FROM clientes`, está projetando um subconjunto de atributos e preservando todas as tuplas da relação filtrada.

A ordem lógica de avaliação é:

| Etapa | O que acontece |
|---|---|
| `FROM` / `JOIN` | Monta o conjunto de linhas e resolve correspondências |
| `WHERE` | Filtra linhas individuais |
| `GROUP BY` | Colapsa linhas em grupos |
| `HAVING` | Filtra grupos |
| Window functions | Calculam sobre partições, sem colapsar linhas |
| `SELECT` | Projeta colunas e expressões |
| `DISTINCT` | Remove duplicatas do resultado projetado |
| `ORDER BY` | Ordena o resultado final |
| `LIMIT` / `OFFSET` | Corta a quantidade de linhas |

Essa ordem explica três comportamentos que confundem: você não pode usar um alias do `SELECT` no `WHERE` (o `WHERE` roda antes); `HAVING` pode usar agregações, `WHERE` não; e `LIMIT` sem `ORDER BY` não significa “as primeiras linhas”, significa “quaisquer linhas, na ordem que o plano entregar”.

Considere o schema de um marketplace:

```sql
CREATE TABLE clientes (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome       text NOT NULL,
    email      text NOT NULL UNIQUE,
    criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pedidos (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cliente_id  bigint NOT NULL REFERENCES clientes (id),
    status      text NOT NULL CHECK (status IN ('pendente', 'pago', 'cancelado')),
    total_centavos bigint NOT NULL CHECK (total_centavos >= 0),
    criado_em   timestamptz NOT NULL DEFAULT now()
);
```

Uma consulta para a última página de pedidos pagos de um cliente:

```sql
SELECT p.id, p.total_centavos, p.criado_em
FROM pedidos AS p
WHERE p.cliente_id = 42
  AND p.status = 'pago'
ORDER BY p.criado_em DESC, p.id DESC
LIMIT 20;
```

O `ORDER BY` tem duas colunas de propósito. `criado_em` pode empatar; `id` desempata e torna a ordem determinística. Sem isso, duas execuções podem devolver páginas diferentes e você acusa o banco de “perder” registros.

O plano pode ser lido com:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.total_centavos, p.criado_em
FROM pedidos AS p
WHERE p.cliente_id = 42
  AND p.status = 'pago'
ORDER BY p.criado_em DESC, p.id DESC
LIMIT 20;
```

Em uma tabela pequena, é normal ver `Seq Scan` seguido de `Sort`; em uma tabela grande com índice composto `(cliente_id, status, criado_em DESC, id DESC)`, o plano vira `Index Scan` e o `LIMIT` para de ler cedo. O custo mostrado não é em reais nem em milissegundos: é uma unidade relativa calibrada por `seq_page_cost`, `random_page_cost` e `cpu_tuple_cost`. Use-o para comparar planos, não para prometer latência.

No JDBC, a mesma consulta precisa de parâmetros, colunas explícitas e ordem estável:

```java
String sql = """
    SELECT id, total_centavos, criado_em
    FROM pedidos
    WHERE cliente_id = ? AND status = ?
    ORDER BY criado_em DESC, id DESC
    LIMIT ?
    """;

try (Connection conn = dataSource.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setLong(1, 42L);
    ps.setString(2, "pago");
    ps.setInt(3, 20);

    try (ResultSet rs = ps.executeQuery()) {
        while (rs.next()) {
            long id = rs.getLong("id");
            long total = rs.getLong("total_centavos");
            var criadoEm = rs.getObject("criado_em", java.time.OffsetDateTime.class);
            System.out.printf("%d %d %s%n", id, total, criadoEm);
        }
    }
}
```

`PreparedStatement` não é só proteção contra SQL injection; ele permite reutilizar o plano e evita concatenar valores com tipos diferentes. O `LIMIT` parametrizado também impede que um cliente peça 5 milhões de linhas por acidente.

## Na prática

Trate toda query de produto como um contrato com quatro cláusulas: **grão**, **filtro**, **ordenação** e **limite**. Antes de escrever, responda: uma linha do resultado representa o quê? Um pedido? Um item? Um cliente por mês? Se o dashboard soma `total_centavos` depois de juntar itens, você está somando o total do pedido uma vez por item. O número cresce, mas o código parece correto.

Para consultas exploratórias, `SELECT *` é aceitável no psql. Em código de aplicação, ele é dívida: qualquer coluna nova altera o payload, e o banco move bytes que ninguém vai usar. Em relatórios, `LIMIT` é uma proteção operacional, não uma regra de negócio. Se a pergunta é “todos os pedidos pagos do mês”, o `LIMIT` precisa vir de uma decisão explícita — e documentada.

## Armadilhas comuns

- **Achar que a ordem do `SELECT` é a ordem de execução.** Isso leva a tentar usar alias no `WHERE` e a colocar filtro de tabela externa no lugar errado em joins.
- **Usar `LIMIT` sem `ORDER BY`.** O resultado é arbitrário e muda quando o plano muda, quando chega um índice novo ou quando o autovacuum roda.
- **Confundir custo com tempo.** `cost=0.00..45.20` não significa 45 ms. Com cache quente, buffers e paralelismo, a relação entre custo e tempo varia.
- **Ignorar o grão ao agregar.** `SUM(pedidos.total_centavos)` com join de itens multiplica o total. Valide com `COUNT(*)` e `COUNT(DISTINCT pedidos.id)` antes de confiar no valor.

## Checklist de domínio

- [ ] Você explica a ordem lógica de uma query sem consultar, incluindo onde entram window functions e `DISTINCT`.
- [ ] Você consegue justificar por que `ORDER BY criado_em` sozinho não garante paginação estável.
- [ ] Você lê um `EXPLAIN` simples e identifica o nó que produz as linhas, o filtro e a ordenação.
- [ ] Você sabe dizer o grão de uma query antes de escrever o `GROUP BY`.

## Para ir além

- [PostgreSQL 16 — Query Overview](https://www.postgresql.org/docs/16/queries-overview.html): o mapa oficial das etapas de uma query.
- [PostgreSQL 16 — SELECT](https://www.postgresql.org/docs/16/sql-select.html): referência completa de `FROM`, `WHERE`, `GROUP BY`, `ORDER BY` e `LIMIT`.
- [Use The Index, Luke — Anatomy of a Query](https://use-the-index-luke.com/sql/anatomy): explicação visual e prática de como o banco processa a query.
