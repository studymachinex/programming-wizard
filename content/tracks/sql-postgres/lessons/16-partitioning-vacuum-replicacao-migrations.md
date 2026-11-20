> **Em uma frase:** produção PostgreSQL é menos sobre queries e mais sobre espaço, vacuum, réplicas e migrations que não travam a tabela.

Uma query perfeita não salva uma tabela com 80% de bloat, autovacuum sufocado e uma migration que bloqueia escritas por 20 minutos. Operar PostgreSQL exige entender o ciclo de vida dos dados e das versões.

## O problema

A tabela de eventos cresce 50 GB por mês. `DELETE` antigo não devolve espaço; o vacuum não acompanha; o disco enche. Uma migration `ALTER TABLE ... ADD COLUMN NOT NULL DEFAULT` (em versões antigas) reescreve a tabela. Um failover demora mais que o timeout da aplicação.

## Como funciona

**Partitioning declarativo** por range de data:

```sql
CREATE TABLE eventos (
  id bigint generated always as identity,
  criado_em timestamptz not null,
  tipo text not null,
  payload jsonb
) PARTITION BY RANGE (criado_em);

CREATE TABLE eventos_2026_11 PARTITION OF eventos
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE INDEX ON eventos_2026_11 (tipo, criado_em);
```

Consultas com filtro em `criado_em` fazem partition pruning. Dropar uma partição antiga é O(1) e não gera bloat.

**Vacuum:** `VACUUM` recupera espaço de tuplas mortas para reuso; `VACUUM FULL` reescreve e bloqueia. Autovacuum precisa acompanhar a taxa de atualização. Monitore `pg_stat_user_tables.n_dead_tup` e `last_autovacuum`.

**Réplica lógica** publica mudanças para outro banco/versão. Réplica física serve leitura e failover, com lag que pode causar leitura stale. Defina `synchronous_commit` e `synchronous_standby_names` conforme o RPO.

**Migrations sem downtime:** adicione coluna nullable, backfill em lotes, crie índice `CONCURRENTLY`, depois torne `NOT NULL` com constraint validada. Evite `ALTER TYPE` e reescritas em horário de pico.

```sql
CREATE INDEX CONCURRENTLY idx_pedidos_status ON pedidos (status);
```

## Na prática

Monitore tamanho, bloat, cache hit, conexões, locks e lag. Use `pg_stat_statements` para as queries que mais consomem tempo total. Faça backup testado — backup que nunca foi restaurado não é backup.

Em Java, configure o pool do Agroal menor que `max_connections`, timeouts e `statement_timeout`. Uma conexão presa pode esgotar o pool.

## Armadilhas comuns

- `VACUUM FULL` em produção sem janela.
- Autovacuum desligado "para não atrapalhar".
- Migration que reescreve tabela bilionária.
- Ler de réplica sem tolerar lag.
- Partição sem índice próprio.
- `DROP PARTITION` sem verificar dependências.

## Checklist de domínio

- [ ] Sei criar partições por range e podar.
- [ ] Monitoro dead tuples e autovacuum.
- [ ] Entendo bloat e quando `VACUUM FULL` é necessário.
- [ ] Configuro réplica e conheço o lag.
- [ ] Escrevo migrations em etapas seguras.

## Para ir além

Leia os capítulos de VACUUM, partitioning e logical replication do PostgreSQL 16. Depois simule uma migration de 10 milhões de linhas sem bloquear escritas.
