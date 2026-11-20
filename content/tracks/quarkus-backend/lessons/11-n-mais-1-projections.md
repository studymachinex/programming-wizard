> **Em uma frase:** N+1 não é um bug do Hibernate — é uma decisão de carregamento que você deixou o runtime tomar no lugar do seu código.

## O problema

Uma listagem de 50 pedidos parece inocente no ambiente local: o banco responde em 1 ms e a tela abre. Em produção, cada pedido serializa o cliente lazy e o Hibernate dispara mais um `SELECT`. São 51 queries para montar uma página. Se a resposta também inclui os itens de cada pedido, o padrão vira 1 + N + N×M e o p99 explode sem que nenhuma query individual esteja lenta. O pool satura, o gateway estoura e o alerta aponta para o serviço errado; o log mostra dezenas de `select ... from cliente where id = ?` idênticas.

## Como funciona

**Onde o N+1 nasce.** `@OneToMany` e `@ManyToMany` são `LAZY` por padrão. Já `@ManyToOne` e `@OneToOne` são `EAGER`, o que esconde o custo: o Hibernate pode resolver o to-one com um join na consulta inicial, mas qualquer mudança de configuração ou acesso fora da consulta original volta a gerar selects. Declare `fetch = FetchType.LAZY` em todos os relacionamentos e carregue explicitamente o que a resposta precisa.

**Como detectar.** Log de SQL com parâmetros revela a mesma query repetida com IDs diferentes. `quarkus.hibernate-orm.statistics=true` mostra a contagem de queries por sessão ao final da requisição. No APM, uma requisição com 50 spans de banco é N+1 visível de longe.

**Como resolver.** Cada ferramenta tem um custo:

| Técnica | Efeito | Cuidado |
|---|---|---|
| `JOIN FETCH` | Uma query traz entidade + relacionamento | Coleção multiplica linhas; paginação quebra |
| `@NamedEntityGraph` + hint | Define o grafo de fetch sem escrever join | Mais verboso; não existe `@EntityGraph` no JPA puro |
| `@BatchSize` | Carrega relacionamentos em lotes de N | Ainda são múltiplas queries; bom para muitos pais |
| `project(...)` | Seleciona só as colunas necessárias | Não serve para alterar estado |
| Duas queries | Pagina IDs e busca o grafo depois | Ordem original precisa ser restaurada em memória |

**O conflito com paginação.** Um `JOIN FETCH` de coleção faz o conjunto de linhas crescer: 50 pedidos com 5 itens viram 250 linhas. Se você aplicar `LIMIT 50`, o banco corta linhas, não pedidos, e a coleção sai incompleta. O Hibernate detecta isso e emite `HHH000104: firstResult/maxResults specified with collection fetch; applying in memory`, paginando depois de carregar tudo. Com 200 mil pedidos, a consulta "paginada" traz o banco inteiro para a heap.

A correção é não misturar as duas coisas: pagine os IDs e faça o fetch da coleção só para aquela página, ou use `@BatchSize` e deixe o Hibernate buscar as coleções em lotes. O Hibernate 6 também conhece o hint `jakarta.persistence.fetchgraph` para aplicar um grafo nomeado sem escrever o join.

```java
package com.exemplo.pedidos;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Page;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.*;
import org.hibernate.annotations.BatchSize;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
@Entity
@Table(name = "pedido")
@NamedEntityGraph(name = "Pedido.comCliente", attributeNodes = @NamedAttributeNode("cliente"))
public class Pedido extends PanacheEntityBase {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "pedido_seq")
    @SequenceGenerator(name = "pedido_seq", sequenceName = "pedido_seq", allocationSize = 50)
    public Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cliente_id", nullable = false)
    public Cliente cliente;
    @OneToMany(mappedBy = "pedido", cascade = CascadeType.ALL, orphanRemoval = true)
    @BatchSize(size = 25)
    public List<ItemPedido> itens = new ArrayList<>();
    @Column(nullable = false, precision = 19, scale = 2)
    public BigDecimal total;
    @Column(name = "criado_em", nullable = false)
    public Instant criadoEm;
}

@ApplicationScoped
public class PedidoRepository implements PanacheRepository<Pedido> {
    public List<Pedido> paginaComCliente(int pagina, int tamanho) {
        return find("select p from Pedido p join fetch p.cliente order by p.criadoEm desc")
                .page(Page.of(pagina, tamanho))
                .list();
    }

    public List<Pedido> paginaComGrafo(int pagina, int tamanho) {
        var em = getEntityManager();
        return em.createQuery("select p from Pedido p order by p.criadoEm desc", Pedido.class)
                .setHint("jakarta.persistence.fetchgraph", em.getEntityGraph("Pedido.comCliente"))
                .setFirstResult(pagina * tamanho)
                .setMaxResults(tamanho)
                .getResultList();
    }
}
```

`@EntityGraph` não é uma anotação do JPA: o que existe é `@NamedEntityGraph` na entidade e o hint `jakarta.persistence.fetchgraph` (ou `loadgraph`) na consulta. Se você viu `@EntityGraph(attributePaths = ...)`, era de um repositório que define a própria anotação — não conte com isso no Panache.

## Na prática

```properties
%dev.quarkus.hibernate-orm.log.sql=true
%dev.quarkus.hibernate-orm.log.bind-parameters=true
quarkus.hibernate-orm.statistics=true
quarkus.hibernate-orm.batch-fetch-size=25
```

`quarkus.hibernate-orm.batch-fetch-size` mapeia para `hibernate.default_batch_fetch_size` e vale para todas as coleções sem `@BatchSize`. Um valor entre 20 e 50 equilibra número de queries e memória; valores altos demais criam `IN (...)` gigantes.

Para uma tela que só mostra id, nome do cliente e total, não carregue a entidade inteira. A projection evita materializar objetos gerenciados e reduz colunas trafegadas:

```java
package com.exemplo.pedidos;

import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Page;
import io.quarkus.runtime.annotations.RegisterForReflection;
import jakarta.enterprise.context.ApplicationScoped;
import java.math.BigDecimal;
import java.util.List;

@RegisterForReflection
public record PedidoResumo(Long id, String cliente, BigDecimal total) {
}
@ApplicationScoped
public class PedidoResumoRepository implements PanacheRepository<Pedido> {
    public List<PedidoResumo> resumos(int pagina, int tamanho) {
        return find("select p.id, p.cliente.nome, p.total from Pedido p order by p.criadoEm desc")
                .page(Page.of(pagina, tamanho))
                .project(PedidoResumo.class)
                .list();
    }
}
```

O `project` usa o construtor do DTO e os nomes dos parâmetros; records funcionam bem porque preservam nome e ordem. Em native, registre o DTO para reflexão.

Quando a paginação precisa incluir a coleção de itens, separe em duas consultas: uma para os IDs da página, outra para o grafo daquela página.

```java
public List<Pedido> paginaComItens(int pagina, int tamanho) {
    var em = getEntityManager();
    List<Long> ids = em.createQuery("select p.id from Pedido p order by p.criadoEm desc", Long.class)
            .setFirstResult(pagina * tamanho)
            .setMaxResults(tamanho)
            .getResultList();
    if (ids.isEmpty()) return List.of();
    return em.createQuery("select distinct p from Pedido p join fetch p.itens where p.id in :ids",
                    Pedido.class)
            .setParameter("ids", ids)
            .getResultList();
}
```

O `IN` não preserva a ordem dos IDs; reordene em memória pelo mapa `id -> posição` ou use `ORDER BY CASE` se a ordem for parte do contrato.

## Armadilhas comuns

- **`@ManyToOne` EAGER por padrão.** O join inicial esconde o custo e a mudança para LAZY revela um N+1 que já existia. Teste a listagem com volume.
- **N+1 fora do repositório.** A query parece única, mas a serialização do DTO acessa o cliente e dispara os selects. Meça a requisição inteira.
- **`JOIN FETCH` de duas coleções.** O produto cartesiano estoura a memória ou lança `MultipleBagFetchException`. Uma coleção por consulta.
- **`LIMIT` com fetch de coleção.** O Hibernate pagina em memória e avisa com `HHH000104`. Se o log mostra esse código, a consulta não está paginando no banco.
- **Projection com `select *`.** Se você seleciona a entidade inteira e mapeia para DTO, perdeu o ganho. Selecione apenas as colunas usadas.
- **Estatísticas ligadas em produção.** A coleta tem custo e polui o log. Use em dev, staging ou por tempo limitado.

## Checklist de domínio

- [ ] Você identifica N+1 pelo log, pelas estatísticas ou pelo tracing, não por chute
- [ ] Você declara `LAZY` nos relacionamentos e carrega explicitamente o que a resposta usa
- [ ] Você sabe quando `JOIN FETCH` é seguro com paginação e quando não é
- [ ] Você usa `@NamedEntityGraph`/hint ou `@BatchSize` quando o join fetch não serve
- [ ] Você usa projection para listagens e relatórios, sem materializar entidades
- [ ] Você resolve coleção + paginação com duas queries ou batch, e explica o `HHH000104`

## Para ir além

- [Hibernate ORM User Guide — Fetching](https://hibernate.org/orm/documentation/)
- [Quarkus — Simplified Hibernate ORM with Panache](https://quarkus.io/guides/hibernate-orm-panache)
