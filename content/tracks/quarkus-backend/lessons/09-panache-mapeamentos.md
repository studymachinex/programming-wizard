> **Em uma frase:** mapeamento é contrato com o banco e com o futuro: escolher o tipo de id, o estilo de entidade e o `equals/hashCode` errado cria bugs que só aparecem com volume, concorrência ou a primeira migração.

## O problema

O mapeamento “funciona” no H2 do teste e quebra no PostgreSQL de produção. O id `Long` gerado por identity impede batching; o `equals` baseado em id coloca o objeto em um `HashSet` antes de persistir e ele some depois; o enum é gravado como ordinal e reordenar o `enum` corrompe os dados; duas transações atualizam a mesma linha e a segunda sobrescreve a primeira sem aviso.

Panache reduz o boilerplate, mas não decide modelagem por você. `PanacheEntity` com campos públicos e métodos estáticos é rápido para CRUD e ruim para um domínio que precisa evoluir; repositório separa a consulta do agregado, ao custo de mais uma classe.

## Como funciona

`PanacheEntity` já traz um `id` `Long` público e métodos estáticos de consulta. `PanacheEntityBase` não define id: você declara o seu e mantém os métodos estáticos. `PanacheRepository<T>` e `PanacheRepositoryBase<T, Id>` movem as consultas para um bean injetável, sem estáticos no modelo.

| Base | Id | Estilo | Indicado para |
|---|---|---|---|
| `PanacheEntity` | `Long` público | Active Record | CRUD simples, protótipo |
| `PanacheEntityBase` | Você define | Active Record | Id próprio, entidade enxuta |
| `PanacheRepository<T>` | `Long` | Repositório | Domínio testável, consultas complexas |
| `PanacheRepositoryBase<T, Id>` | Você define | Repositório | Chave não Long |

`@Entity` mapeia a classe, `@Table` nomeia a tabela e `@Id` marca a chave. `@GeneratedValue(strategy = SEQUENCE)` com `@SequenceGenerator(allocationSize = 50)` deixa o Hibernate reservar blocos e fazer batch insert; `IDENTITY` no PostgreSQL exige ida ao banco por linha e desabilita o batch. `@Version` adiciona concorrência otimista: o `UPDATE` inclui a versão lida e, se outra transação alterou a linha, zero linhas são afetadas e o Hibernate lança `OptimisticLockException`.

`@Enumerated(EnumType.STRING)` grava o nome; `ORDINAL` grava a posição e quebra quando alguém reordena o enum. `@Embedded` achata um `@Embeddable` na tabela do dono — bom para valores sem identidade própria, como endereço. Não use embeddable para algo que precisa ser consultado ou evoluído separadamente.

| Geração de id | Ordem | Batch insert | Custo |
|---|---|---|---|
| `SEQUENCE` | Monotônica | Sim | Uma chamada por bloco |
| `IDENTITY` | Monotônica | Não no PostgreSQL | Round-trip por linha |
| UUID v4 | Aleatória | Sim | Fragmenta o índice |
| UUID v7/ULID | Temporal | Sim | Precisa de gerador externo |

UUID v4 é aleatório: cada insert cai em uma página diferente do índice B-tree, piorando a localidade de escrita. UUID v7 e ULID são temporalmente ordenados e reduzem a fragmentação. O Java 21 só traz `UUID.randomUUID()` (v4); v7 exige biblioteca ou função do banco. `@UuidGenerator` do Hibernate gera UUID — por padrão, aleatório — e dispensa `@GeneratedValue`.

`equals/hashCode` precisa sobreviver à transição “transiente → persistido”. Se o id é gerado depois e entra no cálculo, o `hashCode` muda e o objeto desaparece de um `HashSet`. Use uma chave natural imutável ou um UUID atribuído no construtor; se usar id gerado, compare id apenas quando ambos existirem e mantenha o `hashCode` estável.

## Na prática

```java
package com.exemplo.pedido;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "pedidos")
public class Pedido extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "pedido_seq")
    @SequenceGenerator(name = "pedido_seq", sequenceName = "pedido_seq", allocationSize = 50)
    private Long id;

    @Version
    private long versao;

    @Column(nullable = false, unique = true, length = 20)
    private String numero;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StatusPedido status;

    @Embedded
    private EnderecoEntrega entrega; // classe @Embeddable em outro arquivo

    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal total;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private Instant criadoEm;

    protected Pedido() {
    }

    public Pedido(String numero, EnderecoEntrega entrega, Instant criadoEm) {
        this.numero = numero;
        this.entrega = entrega;
        this.criadoEm = criadoEm;
        this.status = StatusPedido.RASCUNHO;
        this.total = BigDecimal.ZERO;
    }

    public Long getId() {
        return id;
    }

    public StatusPedido getStatus() {
        return status;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Pedido outro)) return false;
        return id != null && id.equals(outro.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
```

O repositório concentra as consultas e deixa o resource independente de estáticos:

```java
package com.exemplo.pedido;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Page;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class PedidoRepository implements PanacheRepositoryBase<Pedido, Long> {

    public Optional<Pedido> porNumero(String numero) {
        return find("numero", numero).firstResultOptional();
    }

    public List<Pedido> porStatus(StatusPedido status, int page, int size) {
        return find("status = ?1 order by criadoEm desc", status)
            .page(Page.of(page, size))
            .list();
    }

    public long contarRascunhos() {
        return count("status", StatusPedido.RASCUNHO);
    }
}
```

O `hashCode` constante parece estranho, mas é estável durante toda a vida do objeto; o custo aparece só em coleções grandes, cenário raro para entidades gerenciadas. Se você precisa de igualdade por valor em DTO, use `record`.

## Armadilhas comuns

- **`equals` com id gerado sem null-check.** Dois objetos transientes viram “iguais” porque ambos têm id nulo.
- **`@Enumerated(ORDINAL)`.** Reordenar o enum corrompe silenciosamente os dados existentes.
- **UUID v4 como PK clusterizada.** A escrita aleatória fragmenta o índice; prefira v7/ULID ou sequência.
- **`GenerationType.AUTO` sem saber o dialeto.** O provedor escolhe por você, e o batch pode desaparecer.
- **`@Version` ausente.** Lost update passa despercebido até dois usuários salvarem o mesmo registro.
- **Entidade com setters públicos para tudo.** Qualquer camada altera estado sem passar pela regra do agregado.

## Checklist de domínio

- [ ] Você escolhe entre `PanacheEntity`, `PanacheEntityBase` e repositório com critério
- [ ] Você entende o custo de sequence, identity e UUID aleatório no índice
- [ ] Você implementa `equals/hashCode` que funciona antes e depois de persistir
- [ ] Você usa `@Version` e trata `OptimisticLockException`
- [ ] Você grava enums como `STRING` e modela embeddables sem identidade própria

## Para ir além

- [Quarkus — Hibernate ORM with Panache](https://quarkus.io/guides/hibernate-orm-panache)
- [Quarkus — Hibernate ORM](https://quarkus.io/guides/hibernate-orm)
- [Hibernate ORM User Guide](https://hibernate.org/orm/documentation/)
- [Martin Fowler — Repository](https://martinfowler.com/eaaCatalog/repository.html)
