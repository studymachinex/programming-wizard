> **Em uma frase:** filtrar e ordenar parece simples até NULL, fuso horário e paginação entrarem na conversa; a diferença entre uma query correta e uma “quase correta” está nos detalhes de borda.

## O problema

A tela de pedidos tem filtros de status, período e valor. O usuário escolhe “março de 2026” e vê 1.842 pedidos. No dia 1º de abril, o mesmo filtro mostra 1.780. Ninguém mexeu no código. O que mudou foi o intervalo: alguém usou `BETWEEN '2026-03-01' AND '2026-03-31'`, e o dia 31 inteiro ficou de fora porque `criado_em` é `timestamptz` e o `BETWEEN` superior aponta para 00:00. O bug estava lá desde o começo; só não havia dados suficientes para aparecer.

Filtros são a parte do SQL que mais parece óbvia e mais esconde armadilhas. `NULL` não é igual a nada, timestamps têm fuso, textos têm collation e `OFFSET` fica mais caro a cada página. Esta aula trata dessas bordas.

## Como funciona

`WHERE` recebe uma expressão booleana de três valores: `TRUE`, `FALSE` e `UNKNOWN`. O `WHERE` só deixa passar `TRUE`. Qualquer comparação com `NULL` — `=`, `<>`, `>`, `IN` — resulta em `UNKNOWN`. Por isso:

```sql
-- ERRADO: não retorna clientes sem telefone
SELECT id, nome FROM clientes WHERE telefone = NULL;

-- CERTO
SELECT id, nome FROM clientes WHERE telefone IS NULL;

-- Também correto para tratar NULL como um valor comparável
SELECT id, nome FROM clientes
WHERE telefone IS DISTINCT FROM '11999990000';
```

`IS DISTINCT FROM` é especialmente útil em comparações de sincronização: ele retorna `TRUE` quando os valores são diferentes, inclusive quando um é `NULL` e o outro não. `IS NOT DISTINCT FROM` faz o inverso.

Para datas, prefira o intervalo semiaberto. Ele funciona com qualquer precisão e não depende de o último instante do dia ser exatamente 23:59:59.999999:

```sql
SELECT id, total_centavos, criado_em
FROM pedidos
WHERE status = 'pago'
  AND criado_em >= TIMESTAMPTZ '2026-03-01 00:00:00-03'
  AND criado_em <  TIMESTAMPTZ '2026-04-01 00:00:00-03'
ORDER BY criado_em DESC, id DESC
LIMIT 50;
```

O deslocamento `-03` é o horário de Brasília. Se o time trabalha com múltiplos fusos, a regra deve ser explícita: “o dia fiscal começa à meia-noite de São Paulo” ou “o relatório é em UTC”. `timestamptz` guarda o instante; a exibição depende do `TimeZone` da sessão. Já `timestamp` (sem fuso) guarda uma data e hora “de parede”, sem saber a que instante pertence. Para eventos de sistema, use `timestamptz`.

Evite aplicar funções na coluna filtrada. `WHERE date(criado_em) = '2026-03-15'` é legível, mas impede o uso direto de um índice B-tree em `criado_em`, porque o banco precisa calcular `date()` para cada linha. Se a intenção é “o dia 15 no fuso de São Paulo”, o intervalo correto é:

```sql
WHERE criado_em >= TIMESTAMPTZ '2026-03-15 00:00:00-03'
  AND criado_em <  TIMESTAMPTZ '2026-03-16 00:00:00-03'
```

`ORDER BY` também tem regras. Em PostgreSQL, `ASC` coloca `NULL` por último e `DESC` coloca `NULL` primeiro. Isso raramente é o que o produto quer. Se a lista deve mostrar “sem data” no fim, seja explícito:

```sql
SELECT id, nome, ultimo_acesso
FROM clientes
ORDER BY ultimo_acesso DESC NULLS LAST, id DESC;
```

Texto é ordenado conforme a collation do banco ou da coluna. Em português, `ORDER BY nome` pode colocar “Álvaro” depois de “Zeca” se a collation for `C`. Para ordenação humana, use uma collation locale apropriada ou `unaccent` na expressão — e saiba que isso afeta índice e custo.

`LIMIT` e `OFFSET` completam a cláusula. `LIMIT 20 OFFSET 40` pula 40 linhas e devolve 20. O problema é que o banco precisa produzir e descartar as 40 anteriores. Em `OFFSET 100000`, ele lê 100.020 linhas para entregar 20. Além do custo, a página “escorrega” quando novos pedidos chegam entre uma requisição e outra: o item que estava na página 2 pode aparecer de novo na página 3. Keyset pagination resolve isso usando a última chave como ponto de partida, assunto de uma aula posterior.

Um plano típico para o filtro de março com índice em `(status, criado_em)`:

```text
Limit  (cost=0.43..812.10 rows=50 width=32) (actual time=0.041..1.820 rows=50 loops=1)
  ->  Index Scan Backward using pedidos_status_criado_em_idx on pedidos
        Index Cond: ((status = 'pago'::text) AND (criado_em >= ...) AND (criado_em < ...))
Buffers: shared hit=48
```

O `Index Scan Backward` aparece porque a ordenação é descendente e o índice já está na ordem certa. Se o plano mostrar `Sort` com `Sort Method: external merge Disk: 24MB`, a ordenação não coube em `work_mem` e foi para disco.

No JDBC, tipos importam. Não passe data como string concatenada; use `setObject` com `OffsetDateTime`:

```java
String sql = """
    SELECT id, total_centavos, criado_em
    FROM pedidos
    WHERE status = ?
      AND criado_em >= ?
      AND criado_em <  ?
    ORDER BY criado_em DESC, id DESC
    LIMIT ?
    """;

try (Connection conn = dataSource.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, "pago");
    ps.setObject(2, OffsetDateTime.parse("2026-03-01T00:00:00-03:00"));
    ps.setObject(3, OffsetDateTime.parse("2026-04-01T00:00:00-03:00"));
    ps.setInt(4, 50);

    try (ResultSet rs = ps.executeQuery()) {
        while (rs.next()) {
            System.out.println(rs.getLong("id") + " " + rs.getObject("criado_em"));
        }
    }
}
```

Se o driver ou o pool não suportar `OffsetDateTime` diretamente, use `java.sql.Timestamp.from(offsetDateTime.toInstant())`. O importante é que o instante chegue ao banco, não a string formatada no locale do servidor.

## Na prática

Um filtro de produto geralmente combina campos opcionais: status, cliente, período, valor mínimo. Evite o padrão `WHERE (? IS NULL OR status = ?)` para tudo. Ele é fácil de escrever, mas costuma gerar um plano genérico que não usa índice para nenhum dos casos. Prefira montar a query com os predicados presentes — com uma lista branca de colunas, nunca concatenando entrada do usuário — ou usar uma função SQL com parâmetros e `plpgsql` que retorne SQL dinâmico seguro.

Para relatórios, defina o fuso explicitamente no início da sessão:

```sql
SET TIME ZONE 'America/Sao_Paulo';
```

Isso não muda os instantes armazenados; muda a interpretação de literais sem fuso e a formatação de saída. É uma decisão de sessão, não um conserto de dados.

## Armadilhas comuns

- **`BETWEEN` com timestamp.** O limite superior é inclusivo e, se for meia-noite, exclui o dia inteiro. Use `>= início AND < próximo_início`.
- **`NOT IN` com subquery que pode retornar NULL.** Se houver um NULL, o resultado inteiro fica vazio. Prefira `NOT EXISTS`.
- **`ORDER BY` sem desempate.** Empates podem variar entre execuções. Em paginação, sempre ordene por uma chave única ou composta.
- **`OFFSET` como solução de paginação.** Funciona nas primeiras páginas, degrada nas profundas e não é estável sob escrita concorrente.

## Checklist de domínio

- [ ] Você explica por que `WHERE coluna = NULL` nunca retorna linhas.
- [ ] Você escreve um filtro de mês com `>=` e `<`, respeitando um fuso explícito.
- [ ] Você reconhece quando uma função na coluna impede o uso de índice.
- [ ] Você sabe por que `LIMIT` sem `ORDER BY` não define uma página.

## Para ir além

- [PostgreSQL 16 — SELECT](https://www.postgresql.org/docs/16/sql-select.html): sintaxe e semântica de `WHERE`, `ORDER BY`, `LIMIT` e `OFFSET`.
- [PostgreSQL 16 — Comparison Functions and Operators](https://www.postgresql.org/docs/16/functions-comparison.html): `IS DISTINCT FROM`, `BETWEEN` e comparações com NULL.
- [Use The Index, Luke — Sorting and Pagination](https://use-the-index-luke.com/no-offset): por que `OFFSET` profundo é caro e como pensar em paginação por cursor.
