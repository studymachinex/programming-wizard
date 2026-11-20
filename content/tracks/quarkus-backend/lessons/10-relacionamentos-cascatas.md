> **Em uma frase:** a foreign key mora no lado many; o lado `@OneToMany(mappedBy=...)` só espelha, e cascata é uma decisão de propriedade do agregado — não um atalho para “salvar tudo junto”.

## O problema

O pedido tem itens. O desenvolvedor mapeia `@OneToMany` com `@JoinColumn` nos dois lados, adiciona `CascadeType.ALL` em tudo e descobre três problemas: colunas duplicadas, remoção de um item apagando o produto compartilhado, e lista em memória que não reflete o banco porque só o lado inverso foi alterado.

O outro extremo é não ter cascata nenhuma. O agregado é salvo, os itens ficam transientes, e o `flush` falha com transient object ou FK nula. Entre os dois existe um desenho: owning side explícito, cascata na direção do agregado e consistência bidirecional mantida por métodos de domínio.

## Como funciona

Em `Pedido 1 — N ItemPedido`, a tabela `itens_pedido` guarda `pedido_id`. O lado `@ManyToOne` é o owning side por padrão: é ele que dita o valor da FK no banco. O `@OneToMany(mappedBy = "pedido")` é o lado inverso, não cria coluna e aponta para o campo que possui o relacionamento.

`@ManyToOne` tem `EAGER` como padrão JPA. Em produção, quase sempre é a escolha errada: toda carga de item arrasta pedido e produto. Declare `fetch = FetchType.LAZY`, com `optional = false` e `@JoinColumn(nullable = false)` quando a associação é obrigatória.

Cascata segue a direção de propriedade. `PERSIST` e `MERGE` no pai propagam para os filhos do agregado; `REMOVE` no pai apaga os filhos, o que faz sentido quando eles não existem sem ele. Já `REMOVE` em `@ManyToOne` é perigoso: remover um item propagaria a remoção ao produto ou cliente, compartilhado por outros pedidos.

| Cascata | Efeito | Onde faz sentido |
|---|---|---|
| `PERSIST` | Persiste filhos novos junto com o pai | Agregado recém-criado |
| `MERGE` | Propaga alterações do pai para os filhos | Atualização do agregado |
| `REMOVE` | Remove filhos quando o pai é removido | Filho sem vida própria |
| `ALL` | Todas as operações | Agregado coeso, nunca no lado many |
| `orphanRemoval` | Remove o filho que saiu da coleção | Itens removidos do pedido |

`orphanRemoval = true` não substitui `CascadeType.REMOVE`: o primeiro age quando o filho deixa a coleção; o segundo, quando o pai inteiro é removido. Em um agregado, use os dois juntos — `cascade = CascadeType.ALL, orphanRemoval = true` — desde que o filho não seja compartilhado.

Consistência bidirecional é obrigatória em memória. Se você só adiciona à lista, o owning side continua com `pedido = null` e o `flush` grava FK nula ou falha. `adicionarItem` e `removerItem` devem atualizar os dois lados. O banco sempre acredita no owning side.

## Na prática

```java
package com.exemplo.pedido;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "pedidos")
public class Pedido extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToMany(mappedBy = "pedido", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ItemPedido> itens = new ArrayList<>();

    protected Pedido() {}

    public void adicionarItem(Produto produto, int quantidade) {
        itens.add(new ItemPedido(this, produto, quantidade));
    }

    public void removerItem(ItemPedido item) {
        itens.remove(item);
        item.desvincular();
    }

    public Long getId() { return id; }

    public List<ItemPedido> getItens() { return List.copyOf(itens); }
}

@Entity
@Table(name = "itens_pedido")
class ItemPedido extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pedido_id", nullable = false)
    private Pedido pedido;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "produto_id", nullable = false)
    private Produto produto;

    private int quantidade;

    @Column(name = "preco_unitario", nullable = false, precision = 19, scale = 2)
    private BigDecimal precoUnitario;

    protected ItemPedido() {}

    ItemPedido(Pedido pedido, Produto produto, int quantidade) {
        this.pedido = pedido;
        this.produto = produto;
        this.quantidade = quantidade;
        this.precoUnitario = produto.getPreco(); // congela o preço da compra
    }

    void desvincular() {
        this.pedido = null;
    }

    public Long getProdutoId() { return produto.getId(); }

    public int getQuantidade() { return quantidade; }

    public BigDecimal getPrecoUnitario() { return precoUnitario; }
}
```

O DTO corta a recursão `pedido → itens → pedido` e impede que o Jackson atravesse lazy fora da transação:

```java
package com.exemplo.pedido.api;

import com.exemplo.pedido.ItemPedido;
import com.exemplo.pedido.Pedido;
import java.math.BigDecimal;
import java.util.List;

public record PedidoResponse(Long id, List<ItemResponse> itens) {

    public static PedidoResponse de(Pedido pedido) {
        return new PedidoResponse(pedido.getId(),
            pedido.getItens().stream().map(ItemResponse::de).toList());
    }

    public record ItemResponse(Long produtoId, int quantidade, BigDecimal precoUnitario) {
        static ItemResponse de(ItemPedido item) {
            return new ItemResponse(
                item.getProdutoId(), item.getQuantidade(), item.getPrecoUnitario());
        }
    }
}
```

Para carregar o agregado inteiro em uma consulta, use `left join fetch` com `distinct`; em listagens, não carregue a coleção — o próximo assunto é N+1.

## Armadilhas comuns

- **`CascadeType.REMOVE` no `@ManyToOne`.** Remover um filho pode apagar o produto ou cliente compartilhado por outros agregados.
- **`@JoinColumn` nos dois lados.** O lado inverso com `mappedBy` não declara coluna; declarar cria mapeamento conflitante.
- **Alterar só a coleção.** O owning side manda no banco; sem atualizar os dois lados, a FK fica nula ou desatualizada.
- **`@ManyToOne` EAGER.** Carrega o grafo inteiro sem necessidade e mascara N+1; declare `LAZY`.
- **Serializar entidade.** Gera recursão infinita, expõe o modelo e dispara lazy loading na resposta HTTP.
- **Remover item sem regra de agregado.** O total e a disponibilidade precisam ser recalculados no serviço, não no resource.

## Checklist de domínio

- [ ] Você identifica o owning side e sabe onde a FK é gravada
- [ ] Você usa `mappedBy` no lado inverso e `@JoinColumn` só no owning
- [ ] Você escolhe cascata pela direção de propriedade do agregado
- [ ] Você mantém os dois lados consistentes em `adicionar` e `remover`
- [ ] Você distingue `orphanRemoval` de `CascadeType.REMOVE`
- [ ] Você devolve DTO e não serializa a entidade

## Para ir além

- [Quarkus — Hibernate ORM with Panache](https://quarkus.io/guides/hibernate-orm-panache)
- [Hibernate ORM User Guide — associations](https://hibernate.org/orm/documentation/)
- [Jakarta Persistence 3.1](https://jakarta.ee/specifications/persistence/3.1/)
- [Martin Fowler — DDD Aggregate](https://martinfowler.com/bliki/DDD_Aggregate.html)
