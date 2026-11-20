> **Em uma frase:** um índice B-tree só acelera o que consegue navegar pela sua ordem — e em um índice composto a ordem das colunas decide se ele será usado ou apenas ocupará espaço.

## O problema

O dashboard do marketplace consulta os últimos pedidos pagos de um tenant. A tabela `pedidos` tem 40 milhões de linhas; a query levava 1,8 s e o time criou um índice para cada coluna do filtro. As escritas ficaram 30% mais lentas, o disco cresceu e a leitura continuou imprevisível. Havia seis índices, mas nenhum cobria o predicado na ordem certa.

Índice não é uma lista de colunas “importantes”. É uma estrutura ordenada, e o PostgreSQL só a percorre quando o filtro conversa com essa ordem.

## Como funciona

Um B-tree organiza chaves em páginas de 8 KB. A raiz aponta para páginas internas, que apontam para folhas; cada folha guarda chave e `ctid` (a localização física da linha). Com fanout de centenas, uma árvore de três níveis indexa bilhões de linhas. As folhas são encadeadas, o que torna varreduras por intervalo baratas.

Há dois caminhos. O `Index Scan` percorre o índice e busca cada linha no heap. O `Bitmap Index Scan` coleta os `ctid`s e o `Bitmap Heap Scan` lê as páginas em ordem física. Para filtros pouco seletivos, o bitmap ganha; para poucas linhas ou `ORDER BY ... LIMIT`, o index scan.

Seletividade é a fração de linhas devolvida. Um índice em `status` com 95% dos pedidos em `'pago'` quase não reduz nada. O mesmo `status` dentro de `(tenant_id, status, criado_em)` é seletivo, porque o tenant recorta o universo.

Em índice composto, **igualdade primeiro, range depois**. O B-tree desce pelas colunas enquanto houver igualdade; ao encontrar um intervalo, para de usar as seguintes para localizar. A query abaixo usa `(tenant_id, status, criado_em)`:

```sql
CREATE INDEX CONCURRENTLY idx_pedidos_tenant_status_data
    ON pedidos (tenant_id, status, criado_em DESC)
    INCLUDE (total_centavos);

EXPLAIN (ANALYZE, BUFFERS)
SELECT criado_em, total_centavos
FROM pedidos
WHERE tenant_id = 42
  AND status = 'pago'
  AND criado_em >= now() - interval '30 days'
ORDER BY criado_em DESC
LIMIT 50;
```

```text
Limit  (cost=0.56..118.42 rows=50 width=16) (actual time=0.037..0.486 rows=50 loops=1)
  Buffers: shared hit=14
  ->  Index Only Scan using idx_pedidos_tenant_status_data on pedidos
        Index Cond: ((tenant_id = 42) AND (status = 'pago'::text)
                     AND (criado_em >= (now() - '30 days'::interval)))
        Heap Fetches: 0
Planning Time: 0.284 ms
Execution Time: 0.531 ms
```

O `ORDER BY` saiu de graça: o índice já entrega `criado_em` decrescente dentro do prefixo de igualdade, e o `LIMIT` interrompe a leitura após 50 linhas. `Heap Fetches: 0` indica *index-only scan* real, possível porque as páginas estão no visibility map. Se esse número crescer, o vacuum está atrasado — o índice sozinho não contém a visibilidade das tuplas.

Se o índice fosse `(criado_em, tenant_id, status)`, o planner até conseguiria filtrar o mês, mas leria pedidos de todos os tenants antes de descartar. Já `(status, tenant_id, criado_em)` também funcionaria para igualdade nos dois primeiros; a diferença aparece em consultas por tenant sem `status`, que só usam o prefixo `tenant_id`.

Índices parciais indexam apenas as linhas que satisfazem um predicado. Uma fila de pedidos pendentes costuma ser 1% da tabela:

```sql
CREATE INDEX CONCURRENTLY idx_pedidos_pendentes
    ON pedidos (tenant_id, criado_em)
    WHERE status = 'pendente';
```

O índice fica menor, cabe no cache e só é atualizado quando o status entra ou sai de `'pendente'`. O predicado da query precisa conter literalmente `status = 'pendente'` para o planner reconhecer o índice parcial. Índices de expressão resolvem funções: `CREATE INDEX ... ON clientes (lower(email))` atende `WHERE lower(email) = ?`, mas não `WHERE email = ?`.

`INCLUDE` adiciona colunas apenas nas folhas, como *covering index*. Elas não participam da busca nem da ordenação; servem para evitar o acesso ao heap. Cada coluna extra aumenta o tamanho e o custo de escrita.

## Na prática

Projete o índice a partir da query, não da tabela. Liste os filtros, separe igualdades de intervalos, coloque a coluna de ordenação na posição que evita `Sort` e só depois avalie `INCLUDE`. Para uma consulta quente sobre um subconjunto pequeno, índice parcial; para uma função, índice de expressão; para um relatório que lê muitas colunas de poucas linhas, covering.

No Java, a consulta precisa casar com essa ordem. Este repositório Panache limita a consulta sem executar `COUNT(*)` desnecessário:

```java
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Instant;
import java.util.List;

@ApplicationScoped
class PedidoRepository implements PanacheRepository<Pedido> {

    List<Pedido> recentes(long tenantId, Status status, Instant desde, int limite) {
        return find("tenantId = ?1 and status = ?2 and criadoEm >= ?3",
                Sort.descending("criadoEm"), tenantId, status, desde)
                .page(0, limite)
                .list();
    }
}
```

O `Sort.descending("criadoEm")` precisa manter a mesma direção do índice; uma ordenação diferente faz o Hibernate gerar `order by` incompatível e o ganho desaparece. Confirme com o SQL gerado, não com a assinatura do método.

Cada índice é uma segunda escrita. Em uma tabela com seis índices, um `INSERT` atualiza sete estruturas e gera WAL para todas. Atualizações que não mudam colunas indexadas podem usar HOT, mas só se houver espaço na página — `fillfactor` menor ajuda tabelas de atualização intensa. Consulte `pg_stat_user_indexes.idx_scan`: índice com zero leituras há semanas é candidato a remoção.

Em produção, `CREATE INDEX CONCURRENTLY` evita o `ACCESS EXCLUSIVE` que bloqueia escritas. Ele demora mais, não pode rodar dentro de transação e, se falhar, deixa um índice `INVALID`; confira `pg_index.indisvalid` e remova antes de repetir.

## Armadilhas comuns

- **Índice em cada coluna.** O planner pode combinar dois índices com bitmap, mas um composto bem ordenado costuma ser menor e mais previsível.
- **Range antes de igualdade.** `(criado_em, tenant_id)` não localiza o tenant dentro do intervalo; leia o `Index Cond` para confirmar.
- **Função ou cast no lado da coluna.** `WHERE date(criado_em) = ...` impede o uso do índice comum; reescreva como intervalo semiaberto.
- **Criar índice sem `CONCURRENTLY`.** A escrita para, as leituras enfileiram atrás do lock e o incidente dura o tempo da construção.
- **Confiar no índice sem medir.** Um bitmap sobre 30% da tabela pode ser mais lento que `Seq Scan`; `EXPLAIN (ANALYZE, BUFFERS)` decide.

## Checklist de domínio

- [ ] Você explica por que igualdade vem antes de range em um índice composto.
- [ ] Você escolhe entre índice parcial, de expressão e covering para uma query concreta.
- [ ] Você mede o custo de escrita e identifica índices não usados com `pg_stat_user_indexes`.
- [ ] Você cria índices em produção com `CREATE INDEX CONCURRENTLY` e trata índice inválido.

## Para ir além

- [PostgreSQL 16 — CREATE INDEX](https://www.postgresql.org/docs/16/sql-createindex.html): sintaxe, `INCLUDE`, `CONCURRENTLY` e limitações.
- [Use The Index, Luke — The Equals Operator](https://use-the-index-luke.com/sql/where-clause/the-equals-operator): ordem de colunas explicada com diagramas.
- [PostgreSQL 16 — Index-Only Scans and Covering Indexes](https://www.postgresql.org/docs/16/indexes-index-only-scans.html): visibility map e `Heap Fetches`.
