> **Em uma frase:** transação não é “um bloco de queries”; é uma promessa de atomicidade e isolamento que só vale se você souber qual anomalia está disposto a aceitar.

## O problema

Dois clientes compram o último ingresso ao mesmo tempo. O código lê `assentos_livres = 1`, ambos veem disponibilidade, ambos inserem a reserva, e o sistema vende dois ingressos para o mesmo assento. A aplicação tinha `if (livres > 0)`, mas a verificação e a escrita aconteceram em transações separadas — ou na mesma transação, em um isolation level que permite a corrida.

Transações são o mecanismo que impede esse tipo de incoerência, mas não são um interruptor mágico. Cada isolation level permite certas anomalias. Escolher errado produz desde dados duplicados até deadlocks e retries que ninguém implementou.

## Como funciona

ACID é um acrônimo útil quando cada letra vira uma pergunta de engenharia:

| Letra | Garantia | O que quebra na prática |
|---|---|---|
| Atomicidade | Tudo ou nada | Uma escrita fora da transação fica mesmo se o resto falhar |
| Consistência | Constraints e regras valem | A aplicação “conserta” dados depois, sem constraint |
| Isolamento | Transações concorrentes não se atrapalham | Isolation baixo permite leituras sujas/fantasmas |
| Durabilidade | Commit sobrevive a crash | `synchronous_commit=off` troca durabilidade por latência |

O PostgreSQL não tem `READ UNCOMMITTED` de verdade: se você pedir, ele entrega `READ COMMITTED`. Os níveis reais são:

- **Read Committed (padrão):** cada statement vê um snapshot novo. Duas leituras na mesma transação podem retornar valores diferentes. É bom para operações curtas e independentes.
- **Repeatable Read:** a transação vê um snapshot fixo a partir da primeira query. Leituras repetidas retornam os mesmos dados. Ainda permite write skew: duas transações leem o mesmo conjunto e escrevem em linhas diferentes, violando uma regra global.
- **Serializable:** usa Serializable Snapshot Isolation (SSI) para detectar dependências perigosas e abortar uma das transações com `40001`. É o único que garante o comportamento como se as transações tivessem rodado em série.

Um exemplo de write skew: a regra “pelo menos um médico de plantão”. Ana e Bruno são os dois únicos; ambos estão de plantão. Duas transações leem “há 2 médicos”, cada uma remove um, e o resultado é zero. Repeatable Read não impede, porque cada transação escreve em uma linha diferente. Serializable aborta uma delas.

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;

SELECT count(*) FROM plantoes WHERE ativo;

UPDATE plantoes SET ativo = false WHERE medico_id = 42;

COMMIT;
```

Se outra transação fizer o mesmo com o médico 43, uma delas recebe:

```text
ERROR:  could not serialize access due to read/write dependencies among transactions
DETAIL:  Reason code: Canceled on identification as a pivot, during write.
HINT:  The transaction might succeed if retried.
SQLSTATE: 40001
```

O `HINT` é literal: **retry**. Não adianta continuar a transação; ela já foi abortada. O retry precisa refazer a lógica desde o `BEGIN`, com backoff e um limite de tentativas.

### Atomicidade na prática

Uma transferência entre contas exige duas atualizações e uma verificação de saldo. Tudo na mesma transação, com locks na ordem correta:

```sql
BEGIN;

UPDATE contas
SET saldo_centavos = saldo_centavos - 10000
WHERE id = 1 AND saldo_centavos >= 10000;

-- Se nenhuma linha foi atualizada, não havia saldo; aborte
-- (no psql, use \gset ou verifique o rowcount na aplicação)

UPDATE contas
SET saldo_centavos = saldo_centavos + 10000
WHERE id = 2;

INSERT INTO transferencias (origem_id, destino_id, valor_centavos, criado_em)
VALUES (1, 2, 10000, now());

COMMIT;
```

O `WHERE saldo_centavos >= 10000` é uma atualização condicional: se o saldo não bastar, zero linhas são afetadas e a aplicação deve abortar. Isso é mais seguro que ler o saldo em uma query separada e depois atualizar, porque a leitura e a escrita não são atômicas entre si.

`SAVEPOINT` permite desfazer parte da transação sem abortar tudo:

```sql
BEGIN;
INSERT INTO pedidos (cliente_id, status) VALUES (42, 'pendente');

SAVEPOINT antes_do_pagamento;
INSERT INTO pagamentos (pedido_id, status) VALUES (1001, 'recusado');
ROLLBACK TO SAVEPOINT antes_do_pagamento;

-- O pedido continua; o pagamento recusado foi descartado
COMMIT;
```

Savepoints são úteis em fluxos com etapas opcionais, mas cada um mantém estado e pode aumentar o custo. Não use como substituto de tratamento de erro na aplicação.

### O que uma transação longa faz

Uma transação aberta mantém um snapshot. O PostgreSQL não pode remover versões de linhas que ainda são visíveis para esse snapshot. Se um relatório abre uma transação e fica 30 minutos lendo, o vacuum não consegue limpar tuplas mortas, a tabela incha e o `pg_stat_activity` mostra `idle in transaction`. Em um sistema com escrita intensa, isso é um incidente esperando para acontecer.

```sql
-- Descubra transações antigas e o que elas estão fazendo
SELECT pid, state, now() - xact_start AS duracao, query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start
LIMIT 10;
```

Configure `idle_in_transaction_session_timeout` e `statement_timeout` para limites que façam sentido para o seu produto. Um `statement_timeout` de 30 segundos pode salvar o banco de uma query acidental; um de 30 minutos não protege nada.

No JDBC, o autocommit é `true` por padrão: cada statement é uma transação própria. Para agrupar, desligue e chame `commit`/`rollback` explicitamente. O padrão correto inclui retry para `40001`:

```java
public void transferir(long origem, long destino, long valorCentavos) throws SQLException {
    for (int tentativa = 1; tentativa <= 3; tentativa++) {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            conn.setTransactionIsolation(Connection.TRANSACTION_SERIALIZABLE);
            try {
                try (PreparedStatement debito = conn.prepareStatement("""
                        UPDATE contas SET saldo_centavos = saldo_centavos - ?
                        WHERE id = ? AND saldo_centavos >= ?
                        """)) {
                    debito.setLong(1, valorCentavos);
                    debito.setLong(2, origem);
                    debito.setLong(3, valorCentavos);
                    if (debito.executeUpdate() != 1) {
                        throw new SaldoInsuficienteException();
                    }
                }
                try (PreparedStatement credito = conn.prepareStatement("""
                        UPDATE contas SET saldo_centavos = saldo_centavos + ? WHERE id = ?
                        """)) {
                    credito.setLong(1, valorCentavos);
                    credito.setLong(2, destino);
                    credito.executeUpdate();
                }
                conn.commit();
                return;
            } catch (SQLException e) {
                conn.rollback();
                if ("40001".equals(e.getSQLState()) && tentativa < 3) {
                    Thread.sleep(50L * tentativa);
                    continue;
                }
                throw e;
            }
        }
    }
}
```

Não misture `setAutoCommit(false)` com conexões de pool sem devolver o estado ao final. Um `autoCommit=false` vazando para a próxima requisição pode deixar uma transação aberta e locks presos.

## Na prática

Escolha o isolation level pela anomalia que o negócio não tolera. Para a maioria das operações CRUD, Read Committed basta. Para relatórios que precisam de consistência entre várias queries, Repeatable Read. Para regras globais — saldo, estoque, assentos — use Serializable ou locks explícitos, e sempre implemente retry.

Se você usar `SELECT ... FOR UPDATE`, o lock começa na leitura e vai até o commit. Isso serializa o acesso à linha, mas também aumenta a contenção. Prefira atualizações condicionais (`UPDATE ... WHERE saldo >= ?`) quando a regra puder ser expressa no próprio `UPDATE`.

## Armadilhas comuns

- **Achar que Repeatable Read elimina todas as anomalias.** Write skew continua possível. Para regras globais, use Serializable ou locks.
- **Não fazer retry em `40001`.** A transação é abortada; continuar gera erro em cascata.
- **Transação longa em relatório.** Segura o snapshot, impede vacuum e aumenta bloat.
- **Deixar `autoCommit=false` vazar no pool.** A próxima requisição herda uma transação aberta. Sempre restaure no `finally`.

## Checklist de domínio

- [ ] Você explica o que Read Committed, Repeatable Read e Serializable permitem.
- [ ] Você reconhece write skew e sabe por que Serializable aborta.
- [ ] Você implementa retry para `40001` e `40P01` sem duplicar efeitos.
- [ ] Você identifica uma transação `idle in transaction` e entende o impacto no vacuum.

## Para ir além

- [PostgreSQL 16 — Transaction Isolation](https://www.postgresql.org/docs/16/transaction-iso.html): tabela de anomalias e detalhes de SSI.
- [PostgreSQL 16 — Explicit Locking](https://www.postgresql.org/docs/16/explicit-locking.html): locks de linha, tabela e advisory.
- [Jepsen — Serializable](https://jepsen.io/consistency/models/serializable): definição formal e testes de consistência em bancos reais.
