> **Em uma frase:** Facade esconde a orquestração de um subsistema atrás de um caso de uso; Composite faz folha e grupo responderem à mesma operação.

## O problema

O checkout nasceu no app. Depois veio o painel administrativo, depois um job de reprocessamento. Os três repetem a mesma sequência: reservar estoque, calcular frete, cobrar cartão, enviar e-mail. Quando o time financeiro pede estorno automático em caso de falha, alguém precisa lembrar de alterar os três lugares — e o job, esquecido, continua cobrando sem reservar.

No catálogo, o problema é outro: um kit é composto de produtos e pode conter outro kit. O cálculo de preço usa `instanceof Produto` e `instanceof Kit`, com um `for` que só desce um nível. No dia em que um kit dentro de kit aparece, o total sai menor e ninguém percebe até a nota fiscal.

## Como funciona

**Facade** é um objeto de borda que expõe uma operação de alto nível e coordena vários subsistemas. Ela não substitui as regras deles; define a ordem, o tratamento de falha e o ponto de entrada. Uma fachada por caso de uso — `FinalizarPedido`, `CancelarPedido` — envelhece bem. Uma fachada `SistemaLoja` com trinta métodos vira o mesmo deus que ela deveria esconder.

**Composite** define um componente comum para elementos simples e grupos. O cliente chama `precoCentavos()` sem saber se está diante de um produto ou de uma árvore. O contêiner delega aos filhos, e a recursão resolve qualquer profundidade. A contrapartida é que o contêiner precisa manter invariantes: não aceitar a si mesmo, não formar ciclo e decidir o que fazer com filho inválido.

| Situação | Facade | Composite |
|---|---|---|
| Vários clientes repetem a mesma orquestração | resolve | não |
| Árvore de kits ou categorias | não | resolve |
| Um único serviço estável | `new` direto | lista simples |

Antes, a orquestração e o cálculo de preço ficam espalhados:

```java
import java.util.List;

interface Estoque { List<Item> reservar(long pedidoId); void liberar(long pedidoId); }
interface Pagamento { void cobrar(String cartao, long valorCentavos); }
interface Frete { long calcular(String cep, List<Item> itens); }
interface Email { void confirmar(long pedidoId); }

record Item(long precoCentavos) {}

class CheckoutApp {
    private final Estoque estoque;
    private final Pagamento pagamento;
    private final Frete frete;
    private final Email email;

    CheckoutApp(Estoque estoque, Pagamento pagamento, Frete frete, Email email) {
        this.estoque = estoque;
        this.pagamento = pagamento;
        this.frete = frete;
        this.email = email;
    }

    void finalizar(long pedidoId, String cep, String cartao) {
        var itens = estoque.reservar(pedidoId);
        long total = itens.stream().mapToLong(Item::precoCentavos).sum();
        try {
            pagamento.cobrar(cartao, total + frete.calcular(cep, itens));
            email.confirmar(pedidoId);
        } catch (RuntimeException e) {
            estoque.liberar(pedidoId); // compensação repetida em cada entrada
            throw e;
        }
    }
}
```

Depois, a fachada concentra a sequência e a compensação:

```java
final class FinalizarPedido {
    private final Estoque estoque;
    private final Pagamento pagamento;
    private final Frete frete;
    private final Email email;

    FinalizarPedido(Estoque estoque, Pagamento pagamento, Frete frete, Email email) {
        this.estoque = estoque;
        this.pagamento = pagamento;
        this.frete = frete;
        this.email = email;
    }

    void executar(long pedidoId, String cep, String cartao) {
        var itens = estoque.reservar(pedidoId);
        long total = itens.stream().mapToLong(Item::precoCentavos).sum();
        try {
            pagamento.cobrar(cartao, total + frete.calcular(cep, itens));
            email.confirmar(pedidoId);
        } catch (RuntimeException e) {
            estoque.liberar(pedidoId);
            throw e;
        }
    }
}
```

O Composite elimina o `instanceof` e aceita profundidade arbitrária:

```java
import java.util.ArrayList;
import java.util.List;

sealed interface ItemCatalogo permits Produto, Kit {
    long precoCentavos();
}

record Produto(String nome, long precoCentavos) implements ItemCatalogo {}

final class Kit implements ItemCatalogo {
    private final String nome;
    private final List<ItemCatalogo> itens = new ArrayList<>();

    Kit(String nome) { this.nome = nome; }

    void adicionar(ItemCatalogo item) {
        if (item == this) throw new IllegalArgumentException("kit não pode conter a si mesmo");
        itens.add(item);
    }

    @Override
    public long precoCentavos() {
        return itens.stream().mapToLong(ItemCatalogo::precoCentavos).sum();
    }
}
```

## Na prática

Use Facade quando o custo de mudança está na **ordem** das chamadas, não em uma regra isolada. Use Composite quando o cliente realmente trata árvores como um todo: preço de kit, permissões por pasta, catálogo de categorias. Se o cliente sempre pergunta o tipo antes de agir, o Composite não está funcionando — ele só escondeu o `instanceof`.

As duas soluções são fáceis de exagerar. Uma fachada para um serviço único e estável adiciona um salto de leitura sem reduzir acoplamento. Um Composite para uma lista de dois níveis sem operação uniforme obriga a criar interfaces e contêineres para nada. E cuidado com a fachada que começa a acumular cálculo de desconto, validação de cupom e regra fiscal: nesse ponto ela deixou de ser borda e virou um serviço gordo.

## Armadilhas comuns

- **Fachada que engole exceção.** `catch (Exception e) { log.error("erro"); }` sem relançar faz o cliente achar que o pedido foi finalizado. Preserve a causa e falhe.
- **Fachada por tela, não por caso de uso.** Cada novo botão gera um método; em pouco tempo ela conhece todos os fluxos e todo mundo depende dela.
- **Ciclo no Composite.** Validar apenas `item == this` não impede `kitA` conter `kitB` que contém `kitA`; o cálculo entra em recursão infinita. Valide a cadeia ou mantenha a árvore imutável.
- **Expor a lista interna do kit.** `itens()` direto permite inserir filho sem validação. Devolva `List.copyOf` ou não exponha.
- **Colocar política de desconto dentro do contêiner.** O Composite deve somar estrutura, não decidir campanha comercial. Essa regra pertence a um serviço de precificação.

## Checklist de domínio

- [ ] Você distingue fachada de caso de uso de uma classe deus
- [ ] Você implementa um Composite com operação uniforme e validação de ciclo
- [ ] Você reconhece quando o cliente ainda depende de `instanceof`
- [ ] Você sabe dizer quando orquestração direta ou uma lista bastam

## Para ir além

- [Facade](https://refactoring.guru/design-patterns/facade) — estrutura, variantes e relação com subsistemas.
- [Composite](https://refactoring.guru/design-patterns/composite) — árvores, recursão e operações uniformes.
- [Java SE 21 — Sealed Classes](https://docs.oracle.com/en/java/javase/21/language/sealed-classes-and-interfaces.html) — como fechar a hierarquia do componente.
