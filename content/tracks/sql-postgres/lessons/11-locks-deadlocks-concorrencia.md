> **Em uma frase:** lock não é erro de concorrência; é o mecanismo que serializa conflitos — o problema começa quando você não sabe qual recurso está sendo preso, por quanto tempo e em que ordem.

## O problema

Uma fila de processamento de pagamentos tem 20 workers. Cada um executa `SELECT * FROM jobs WHERE status = 'pendente' LIMIT 1`, processa e faz `UPDATE`. Em produção, os 20 workers pegam o mesmo job, porque o `SELECT` não bloqueia nada. Quando alguém adiciona `FOR UPDATE`, todos passam a esperar pelo mesmo registro e a fila vira um gargalo serial. A solução é `FOR UPDATE SKIP LOCKED`: cada worker pega uma linha livre e segue.

Locks são a parte do PostgreSQL que só aparece quando há concorrência real. Em desenvolvimento, com um usuário e uma conexão, tudo funciona. Em produção, duas transações atualizam a mesma linha, uma espera a outra, e o timeout estoura. Entender os modos de lock e como diagnosticá-los é obrigatório para operar sistemas com escrita.

## Como funciona

O PostgreSQL usa MVCC: leituras normais não bloqueiam escritas e escritas não bloqueiam leituras. Cada `UPDATE` cria uma nova versão da linha e marca a antiga como morta; transações antigas continuam vendo a versão que lhes cabe. Locks explícitos entram quando você precisa impedir que duas transações alterem o mesmo registro ao mesmo tempo.

Os modos de lock de linha mais usados:

| Modo | Bloqueia | Uso típico |
|---|---|---|
| `FOR UPDATE` | `UPDATE`, `DELETE`, `FOR UPDATE`, `FOR NO KEY UPDATE` | Reservar uma linha para alteração |
| `FOR NO KEY UPDATE` | `UPDATE` de colunas não-chave, `FOR UPDATE` | Atualizar sem bloquear FK |
| `FOR SHARE` | `UPDATE`, `DELETE` | Ler consistente sem alterar |
| `FOR KEY SHARE` | `UPDATE` de chave, `DELETE` | Proteger chave referenciada por FK |

`FOR UPDATE` é o mais forte. Ele trava a linha até o commit/rollback e impede que outra transação a atualize ou apague. `FOR NO KEY UPDATE` é mais leve: permite que uma foreign key continue referenciando a linha, mas ainda impede alterações de valor. O PostgreSQL escolhe automaticamente o modo mais fraco necessário para `UPDATE`/`DELETE`; você só declara explicitamente quando precisa reservar antes de escrever.

```sql
BEGIN;

SELECT id, saldo_centavos
FROM contas
WHERE id = 42
FOR UPDATE;

UPDATE contas
SET saldo_centavos = saldo_centavos - 10000
WHERE id = 42;

COMMIT;
```

Se outra transação tentar o mesmo `SELECT ... FOR UPDATE` na linha 42, ela espera até o commit. Se a primeira transação demorar 30 segundos porque está chamando uma API externa, a segunda fica bloqueada 30 segundos. **Nunca segure um lock enquanto espera I/O externo.** Faça a chamada fora da transação ou use um estado intermediário (`processando`) com timeout.

`NOWAIT` falha imediatamente em vez de esperar:

```sql
SELECT id FROM jobs
WHERE status = 'pendente'
ORDER BY criado_em
LIMIT 1
FOR UPDATE NOWAIT;
```

`SKIP LOCKED` ignora linhas já travadas e pega a próxima disponível. É a base de filas concorrentes:

```sql
WITH proximo AS (
    SELECT id
    FROM jobs
    WHERE status = 'pendente'
    ORDER BY criado_em
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
UPDATE jobs j
SET status = 'processando', iniciado_em = now()
FROM proximo
WHERE j.id = proximo.id
RETURNING j.id, j.payload;
```

Cada worker recebe um job diferente. O `ORDER BY criado_em` dá FIFO aproximado; o `LIMIT 1` reduz a contenção. Se não houver índice em `(status, criado_em)`, o banco varre a tabela e trava mais páginas do que o necessário.

`SKIP LOCKED` não é gratuito: ele pode “pular” uma linha que está prestes a ser liberada e criar starvation se os workers sempre pegarem as mais novas. Para filas simples, é uma solução excelente; para roteamento complexo, um broker dedicado pode ser melhor.

### Deadlocks

Um deadlock acontece quando duas transações esperam por locks uma da outra. Exemplo clássico: T1 trava a conta 1 e tenta a 2; T2 trava a 2 e tenta a 1. O PostgreSQL detecta o ciclo após `deadlock_timeout` (1 segundo por padrão) e aborta uma das transações com SQLSTATE `40P01`.

```text
ERROR:  deadlock detected
DETAIL:  Process 12345 waits for ShareLock on transaction 67890; blocked by process 67891.
        Process 67891 waits for ShareLock on transaction 67890; blocked by process 12345.
HINT:  See server log for query details.
SQLSTATE: 40P01
```

A prevenção é ordenar a aquisição de locks. Se toda transferência trava a conta de menor ID primeiro, o ciclo não se forma:

```sql
BEGIN;

-- Sempre na mesma ordem: menor id primeiro
SELECT id FROM contas WHERE id IN (42, 7) ORDER BY id FOR UPDATE;

UPDATE contas SET saldo_centavos = saldo_centavos - 10000 WHERE id = 7;
UPDATE contas SET saldo_centavos = saldo_centavos + 10000 WHERE id = 42;

COMMIT;
```

`ORDER BY id` no `SELECT ... FOR UPDATE` não garante, por si só, que o plano trave na ordem se o índice não fornecer a ordem; verifique com `EXPLAIN`. Em geral, um índice na PK e um `ORDER BY` explícito resolvem. Para múltiplos recursos, defina uma ordem global (por tipo e ID) e siga em todos os fluxos.

### Advisory locks

Nem todo recurso é uma linha. Às vezes você precisa serializar um job por cliente, ou garantir que apenas um processo faça uma migração. `pg_advisory_lock` e `pg_advisory_xact_lock` oferecem locks nomeados pelo application:

```sql
-- Lock de sessão: precisa ser liberado explicitamente
SELECT pg_advisory_lock(hashtext('fechamento:2026-03'));

-- Lock transacional: liberado no commit/rollback
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('migration:2026-03'));
-- trabalho...
COMMIT;
```

Advisory locks não são gerenciados pelo MVCC e não aparecem em `pg_locks` como locks de relação, mas aparecem com `locktype = 'advisory'`. Use chaves de 64 bits bem definidas; `hashtext` pode colidir, embora seja improvável. Para isolamento por tenant, combine um namespace fixo com o ID.

### Diagnóstico

Quando o banco está lento e você suspeita de locks, consulte `pg_locks` e `pg_stat_activity`:

```sql
SELECT a.pid,
       a.state,
       now() - a.xact_start AS idade_transacao,
       l.locktype,
       l.mode,
       l.granted,
       a.query
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE NOT l.granted
   OR a.state = 'idle in transaction'
ORDER BY idade_transacao DESC;
```

Locks não concedidos (`granted = false`) mostram quem está esperando. Para descobrir quem bloqueia, joining `pg_locks` com `pg_blocking_pids(pid)` é mais direto:

```sql
SELECT pid, pg_blocking_pids(pid) AS bloqueadores, query
FROM pg_stat_activity
WHERE cardinality(pg_blocking_pids(pid)) > 0;
```

No JDBC, configure timeouts para não esperar para sempre:

```java
try (Connection conn = dataSource.getConnection();
     Statement st = conn.createStatement()) {
    st.execute("SET LOCAL lock_timeout = '2s'");
    st.execute("SET LOCAL statement_timeout = '5s'");
    // ... transação
}
```

`SET LOCAL` vale só até o fim da transação. Um `lock_timeout` curto transforma um deadlock potencial em erro rápido, que a aplicação pode tratar e repetir. Sem timeout, o pool inteiro pode ficar preso esperando uma linha.

## Na prática

Antes de adicionar um lock, pergunte: qual é o recurso? Quanto tempo a transação vai durar? Qual a ordem de aquisição? Se a resposta for “não sei”, você está criando um incidente futuro.

Para filas, `FOR UPDATE SKIP LOCKED` com índice em `(status, criado_em)` e `LIMIT` pequeno. Para contadores globais, evite uma linha única: use `UPDATE ... SET valor = valor + 1` (atômico) ou shards por chave. Para jobs únicos por cliente, advisory lock transacional. Para consistência de regras globais, Serializable com retry.

## Armadilhas comuns

- **Segurar lock durante chamada HTTP.** A transação fica aberta, o lock é mantido e outros workers esperam. Faça I/O fora da transação.
- **`FOR UPDATE` sem índice.** O banco pode travar muitas linhas ou páginas, aumentando a contenção.
- **Ordem de locks inconsistente.** Um fluxo trava A→B, outro B→A; deadlock garantido.
- **Ignorar `lock_timeout`.** Sem timeout, uma linha travada pode consumir o pool inteiro.

## Checklist de domínio

- [ ] Você escolhe entre `FOR UPDATE`, `FOR NO KEY UPDATE` e `FOR SHARE`.
- [ ] Você implementa uma fila com `SKIP LOCKED` e explica o índice necessário.
- [ ] Você ordena locks para evitar deadlock e reconhece `40P01`.
- [ ] Você consulta `pg_locks`/`pg_blocking_pids` e identifica a transação bloqueadora.

## Para ir além

- [PostgreSQL 16 — Explicit Locking](https://www.postgresql.org/docs/16/explicit-locking.html): tabela completa de modos e conflitos.
- [PostgreSQL 16 — pg_locks](https://www.postgresql.org/docs/16/view-pg-locks.html): colunas e significado dos locks.
- [PostgreSQL Wiki — Lock Monitoring](https://wiki.postgresql.org/wiki/Lock_Monitoring): queries prontas para diagnosticar bloqueios.
