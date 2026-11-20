> **Em uma frase:** constraint é código que roda mesmo quando a aplicação tem bug, o deploy falha ou outro serviço escreve na tabela; por isso ela pertence ao banco.

## O problema

Um serviço de pagamentos cria uma cobrança, o cliente clica duas vezes e nascem duas cobranças idênticas. O código tinha uma verificação `if (repo.buscarPorIdempotencyKey(chave) == null)`, mas duas requisições concorrentes passaram pela verificação antes de qualquer uma inserir. A aplicação não consegue garantir unicidade sob concorrência sem uma constraint no banco.

Constraints são a última linha de defesa do modelo de dados. Elas também documentam o domínio: quem lê o schema sabe que `status` só aceita três valores, que `valor_centavos` é positivo e que um pagamento pertence a um pedido existente. O custo é que cada constraint precisa ser mantida em cada escrita — e algumas exigem cuidado para serem adicionadas em tabelas grandes.

## Como funciona

A **primary key** é `NOT NULL` + `UNIQUE` + um índice. Ela identifica a linha. A escolha do tipo importa mais do que parece:

```sql
CREATE TABLE pedidos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cliente_id bigint NOT NULL REFERENCES clientes (id),
    criado_em timestamptz NOT NULL DEFAULT now()
);
```

`bigint identity` é compacto (8 bytes), ordenado e bom para índices B-tree. `uuid` ocupa 16 bytes e, se for UUIDv4 aleatório, cada insert cai em uma página diferente do índice, aumentando bloat e I/O. UUID é útil quando o ID precisa ser gerado no cliente, exposto publicamente ou combinado entre sistemas. Se você precisa de ambos, mantenha `bigint` como PK interna e um `uuid` único como identificador público. UUIDv7, ordenado por tempo, resolve parte do problema de localidade, mas precisa ser gerado pela aplicação ou por extensão — não presuma que o `gen_random_uuid()` do PostgreSQL 16 é v7.

Chaves naturais — CPF, e-mail, código de produto — parecem econômicas, mas mudam. E-mail muda, CPF pode ser corrigido, código de produto é reciclado. Use uma chave surrogate estável e coloque a chave natural como `UNIQUE` quando ela realmente for única. Isso preserva as referências enquanto o valor de negócio evolui.

**Foreign key** garante que o valor exista no pai. O PostgreSQL cria índice na chave referenciada, mas **não** cria índice na coluna filha. Isso surpreende: um `DELETE` no pai precisa verificar se há filhos; sem índice em `pedidos.cliente_id`, o banco varre a tabela inteira e segura locks por mais tempo. Crie o índice explicitamente:

```sql
CREATE INDEX idx_pedidos_cliente_id ON pedidos (cliente_id);
```

O comportamento de `ON DELETE` é uma decisão de negócio:

```sql
-- Bloqueia exclusão de cliente que ainda tem pedidos
ALTER TABLE pedidos
    DROP CONSTRAINT pedidos_cliente_id_fkey,
    ADD CONSTRAINT pedidos_cliente_id_fkey
        FOREIGN KEY (cliente_id) REFERENCES clientes (id)
        ON DELETE RESTRICT;

-- Ou permite apagar o cliente e seus pedidos em cascata
-- ON DELETE CASCADE
```

`CASCADE` é conveniente em tabelas filhas de um agregado, mas perigoso em entidades centrais. Um `DELETE` acidental em `clientes` pode apagar anos de pedidos. Prefira `RESTRICT` ou `NO ACTION` para dados financeiros e use soft delete quando a retenção for obrigatória.

**UNIQUE** tem uma sutileza: por padrão, vários `NULL` são permitidos, porque `NULL` não é igual a `NULL`. Em PostgreSQL 15+, você pode declarar `UNIQUE NULLS NOT DISTINCT` para permitir no máximo um NULL:

```sql
CREATE TABLE configuracoes (
    cliente_id bigint PRIMARY KEY,
    chave      text NOT NULL,
    valor      text,
    UNIQUE NULLS NOT DISTINCT (cliente_id, chave)
);
```

**CHECK** valida uma expressão por linha. Use para invariantes simples: valores positivos, datas coerentes, estados válidos. Evite `CHECK` que consulta outra tabela; o PostgreSQL não permite subqueries em `CHECK`, e mesmo que permitisse, a validação não seria reavaliada quando a outra tabela mudasse.

```sql
ALTER TABLE pedidos
    ADD CONSTRAINT pedidos_total_positivo CHECK (total_centavos >= 0),
    ADD CONSTRAINT pedidos_status_valido
        CHECK (status IN ('pendente', 'pago', 'cancelado'));
```

**Exclusion constraint** vai além do `UNIQUE`: ela proíbe sobreposição de intervalos. Para reservas de salas, é a ferramenta certa:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE reservas (
    id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sala_id  bigint NOT NULL,
    periodo  tstzrange NOT NULL,
    EXCLUDE USING gist (sala_id WITH =, periodo WITH &&)
);
```

Duas reservas para a mesma sala com períodos sobrepostos falham na inserção, mesmo sob concorrência. A extensão `btree_gist` é necessária para combinar igualdade em `bigint` com sobreposição em `tstzrange`. O custo é um índice GiST e uma validação mais cara que um `UNIQUE` comum.

Constraints podem ser **deferrable**. Por padrão, cada statement valida a constraint imediatamente. Em migrações que movem dados entre tabelas, você pode adiar a verificação para o fim da transação:

```sql
ALTER TABLE pedidos
    ADD CONSTRAINT pedidos_cliente_fk
    FOREIGN KEY (cliente_id) REFERENCES clientes (id)
    DEFERRABLE INITIALLY DEFERRED;

BEGIN;
-- move pedidos e clientes em ordens que violariam a FK no meio do caminho
SET CONSTRAINTS pedidos_cliente_fk IMMEDIATE;
COMMIT;
```

Adiar tem custo: os triggers de verificação acumulam eventos e o banco pode detectar a violação só no commit. Use quando a ordem de escrita exigir, não como padrão.

### Adicionar constraints sem derrubar produção

`ALTER TABLE ... ADD CONSTRAINT ... CHECK` valida todas as linhas e pode segurar um lock forte. Em uma tabela de 200 milhões de linhas, isso é uma janela de indisponibilidade. O padrão seguro é:

```sql
-- 1. Adiciona a regra sem validar os dados antigos (lock curto)
ALTER TABLE pedidos
    ADD CONSTRAINT pedidos_total_positivo
    CHECK (total_centavos >= 0) NOT VALID;

-- 2. Valida em background, com lock mais fraco
ALTER TABLE pedidos VALIDATE CONSTRAINT pedidos_total_positivo;
```

`NOT VALID` vale para `CHECK` e `FOREIGN KEY`. A constraint passa a valer para novas linhas imediatamente; o `VALIDATE` confere as antigas sem bloquear escritas. Para `UNIQUE`, use `CREATE UNIQUE INDEX CONCURRENTLY` e depois `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE USING INDEX nome_do_indice`.

No JDBC, trate violação de unicidade como regra de negócio, não como erro genérico:

```java
String sql = """
    INSERT INTO pagamentos (pedido_id, idempotency_key, valor_centavos, status)
    VALUES (?, ?, ?, 'pendente')
    """;

try (Connection conn = dataSource.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setLong(1, pedidoId);
    ps.setString(2, idempotencyKey);
    ps.setLong(3, valorCentavos);
    ps.executeUpdate();
} catch (SQLException e) {
    if ("23505".equals(e.getSQLState())) {
        // Já existe: busque o pagamento existente e devolva o mesmo resultado
        return repo.buscarPorIdempotencyKey(idempotencyKey);
    }
    throw e;
}
```

O SQLSTATE `23505` é `unique_violation`. Depender do código é mais estável que comparar a mensagem, que muda com locale e versão. `23503` é violação de foreign key; `23514`, de check.

## Na prática

Modele constraints antes de escrever o repositório. Se o domínio diz “um pagamento por chave de idempotência”, isso é um `UNIQUE`, não um `if`. Se diz “o valor é positivo”, é um `CHECK`. Se diz “não pode haver duas reservas sobrepostas”, é uma exclusion constraint. A aplicação pode validar antes para dar mensagens melhores, mas o banco precisa ser a autoridade.

Para cada constraint, saiba o custo: `UNIQUE` e PK criam índices e afetam escrita; FK dispara verificação a cada insert/update e pode segurar locks; `CHECK` é barato, mas varre a tabela na criação. Meça o tempo de `ALTER TABLE` em uma cópia com volume real antes de aplicar em produção.

## Armadilhas comuns

- **Achar que FK cria índice no filho.** Não cria; sem índice, deletes no pai ficam caros e bloqueantes.
- **`UNIQUE` com NULLs.** Vários NULLs passam. Se o domínio exige um único, use `NULLS NOT DISTINCT` ou índice parcial.
- **`ON DELETE CASCADE` em entidade central.** Um delete vira uma reação em cadeia. Prefira `RESTRICT` para dados financeiros.
- **Adicionar `NOT NULL` direto em tabela grande.** Pode exigir varredura e lock. Use `CHECK NOT VALID` + `VALIDATE` e depois `SET NOT NULL`.

## Checklist de domínio

- [ ] Você escolhe entre `bigint identity`, UUID e chave natural com critérios de indexação e exposição.
- [ ] Você sabe que FK não indexa o filho e cria o índice necessário.
- [ ] Você usa `NOT VALID` e `VALIDATE CONSTRAINT` para migrar tabelas grandes.
- [ ] Você reconhece quando uma exclusion constraint substitui uma verificação na aplicação.

## Para ir além

- [PostgreSQL 16 — Constraints](https://www.postgresql.org/docs/16/ddl-constraints.html): referência de PK, FK, UNIQUE, CHECK e exclusion.
- [PostgreSQL 16 — CREATE TABLE](https://www.postgresql.org/docs/16/sql-createtable.html): todas as cláusulas, incluindo `DEFERRABLE` e `NOT VALID`.
- [PostgreSQL Wiki — Don't Do This](https://wiki.postgresql.org/wiki/Don%27t_Do_This): armadilhas comuns de schema e tipos, mantidas pela comunidade.
