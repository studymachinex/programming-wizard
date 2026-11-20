> **Em uma frase:** N+1 não é um problema de ORM — é um problema de acesso a dados; a correção é decidir o que carregar junto e como paginar sem varrer o mundo.

Um endpoint lista 50 pedidos e, para cada um, busca o cliente. São 51 queries. O banco responde cada uma em 1 ms, mas a rede e o ORM transformam em 500 ms. Paginação com `OFFSET 100000` adiciona mais uma camada: o banco lê e descarta 100 mil linhas.

## O problema

O ORM esconde o custo. `pedido.getCliente().getNome()` dentro de um loop dispara uma query por item. Já `LIMIT 20 OFFSET 200000` parece barato, mas o PostgreSQL percorre todas as linhas anteriores. Em telas de "carregar mais", a latência cresce linearmente com a profundidade.

## Como funciona

Detecte N+1 com log de SQL: uma query base seguida de N queries idênticas mudando só o parâmetro. Correções:

1. **JOIN FETCH / EntityGraph:** traga a associação na mesma query.
2. **Batch fetching:** carregue em lotes de 50.
3. **DTO projection:** selecione só o necessário.

```java
// N+1
var pedidos = repo.findAll(pageable);
for (var p : pedidos) p.getCliente().getNome(); // 1 query por pedido

// fetch join explícito
@Query("""
    select p from Pedido p
    join fetch p.cliente
    where p.status = :status
    """)
List<Pedido> buscarComCliente(Status status, Pageable pageable);
```

Keyset pagination troca offset por cursor:

```sql
SELECT id, criado_em, total
FROM pedidos
WHERE (criado_em, id) < (:ultimoCriadoEm, :ultimoId)
ORDER BY criado_em DESC, id DESC
LIMIT 20;
```

O índice em `(criado_em DESC, id DESC)` permite parar após 20 linhas, independentemente da profundidade.

## Na prática

Meça com `quarkus.hibernate-orm.log.sql=true` em dev e com um contador de queries em teste (`hibernate.generate_statistics`). Estabeleça um orçamento: por exemplo, no máximo 3 queries por request.

Cuidado com fetch join e paginação: o join multiplica linhas e o Hibernate faz paginação em memória. Use `@BatchSize` ou duas queries (IDs + dados) nesse caso.

Para relatórios, projeções e SQL nativo costumam vencer o ORM. Para escrita transacional, mantenha entidades e carregue apenas o necessário.

## Armadilhas comuns

- `EAGER` em tudo: resolve um N+1 e cria vários.
- Fetch join em coleção com `Pageable`: warning e paginação errada.
- `OFFSET` profundo em feed.
- Paginar sem `ORDER BY` determinístico: itens repetidos ou pulados.
- Contar queries só em dev com dataset pequeno.

## Checklist de domínio

- [ ] Detecto N+1 pelo log e por estatísticas.
- [ ] Sei escolher join fetch, batch ou projection.
- [ ] Implemento keyset pagination.
- [ ] Tenho índice compatível com a ordenação.
- [ ] Defino orçamento de queries por request.

## Para ir além

Leia a documentação de fetching do Hibernate e o guia de keyset pagination do PostgreSQL. Depois meça um endpoint antes e depois de eliminar N+1.
