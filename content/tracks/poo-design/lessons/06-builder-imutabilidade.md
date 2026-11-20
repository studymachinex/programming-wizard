> **Em uma frase:** Builder troca construtores com muitos parâmetros por uma construção legível que termina em um objeto válido e imutável.

## O problema

O `Pedido` tem cliente, itens, cupom, embalagem de presente, observação, prioridade e endereço. A primeira versão usa um construtor com sete parâmetros. Ninguém lembra a ordem; em algum lugar do código alguém passa `true` no lugar de `false` e o pedido vai para o cliente errado. A segunda versão troca por setters. Agora o objeto existe em estado inválido entre uma chamada e outra: dá para salvar um pedido sem cliente, sem itens ou com cupom nulo.

O problema não é ter muitos campos. É permitir que o objeto seja construído em etapas nas quais as invariantes não valem. Se `Pedido` só faz sentido com cliente e pelo menos um item, o tipo deveria tornar esses estados impossíveis — ou, no mínimo, recusar a construção no `build()`.

## Como funciona

Builder separa **montar** de **validar e criar**. O cliente encadeia chamadas legíveis, e o método `build()` concentra as regras que garantem um objeto consistente. O produto final pode ser um `record`, uma classe com campos `final` ou qualquer tipo imutável. O builder em si é mutável e descartável; o resultado não é.

```java
import java.util.ArrayList;
import java.util.List;

record Item(String sku, int quantidade) {}

class Pedido {
    private String cliente;
    private final List<Item> itens = new ArrayList<>();
    private String cupom;
    private boolean presente;

    public void setCliente(String cliente) { this.cliente = cliente; }
    public void adicionarItem(Item item) { itens.add(item); }
    public void setCupom(String cupom) { this.cupom = cupom; }
    public void setPresente(boolean presente) { this.presente = presente; }

    public String resumo() {
        // Pode ser chamado antes de setCliente, com lista vazia e cupom nulo.
        return cliente.toUpperCase() + " - " + itens.size() + " itens";
    }
}
```

O `resumo()` compila, mas depende de uma ordem de chamadas que o compilador não conhece. O estado inválido é representável; em produção, ele aparece como `NullPointerException` em um job noturno, longe da chamada que esqueceu o cliente.

A versão com record e builder valida na criação e copia a lista:

```java
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

record Item(String sku, int quantidade) {
    Item {
        if (sku == null || sku.isBlank()) throw new IllegalArgumentException("sku obrigatório");
        if (quantidade <= 0) throw new IllegalArgumentException("quantidade deve ser positiva");
    }
}

record Pedido(String cliente, List<Item> itens, String cupom,
              boolean presente, String observacao) {

    public Pedido {
        if (cliente == null || cliente.isBlank()) {
            throw new IllegalArgumentException("cliente obrigatório");
        }
        itens = List.copyOf(itens);
        if (itens.isEmpty()) {
            throw new IllegalArgumentException("pedido sem itens");
        }
        cupom = cupom == null ? "" : cupom;
        observacao = observacao == null ? "" : observacao;
    }

    public static Builder builder(String cliente) {
        return new Builder(cliente);
    }

    public static final class Builder {
        private final String cliente;
        private final List<Item> itens = new ArrayList<>();
        private String cupom = "";
        private boolean presente;
        private String observacao = "";

        private Builder(String cliente) {
            this.cliente = cliente;
        }

        public Builder item(Item item) {
            itens.add(Objects.requireNonNull(item));
            return this;
        }

        public Builder cupom(String cupom) {
            this.cupom = cupom;
            return this;
        }

        public Builder presente() {
            this.presente = true;
            return this;
        }

        public Builder observacao(String observacao) {
            this.observacao = observacao;
            return this;
        }

        public Pedido build() {
            return new Pedido(cliente, itens, cupom, presente, observacao);
        }
    }
}
```

O uso fica assim:

```java
Pedido pedido = Pedido.builder("ana")
        .item(new Item("SKU-1", 2))
        .item(new Item("SKU-2", 1))
        .cupom("WIZARD10")
        .presente()
        .build();
```

Repare em três decisões: o cliente é obrigatório no início, então o builder nem pode ser criado sem ele; `List.copyOf` no construtor do record impede que o builder ou o chamador alterem a lista depois; e `build()` chama o construtor canônico, que valida tudo de novo. A validação não está só no builder — quem criar o record direto também recebe o erro.

## Na prática

Builder brilha quando existem muitos campos opcionais e combinações válidas que não cabem em um construtor. Para dois ou três campos obrigatórios, o construtor do record é mais direto:

```java
record Ponto(double x, double y) {}
```

Para mudanças pequenas em um objeto imutável, um "wither" resolve sem builder:

```java
record Pedido(String cliente, String cupom) {
    Pedido comCupom(String novoCupom) {
        return new Pedido(cliente, novoCupom);
    }
}
```

O ponto de atenção em produção é o builder reutilizado. Ele é mutável; se você guardar uma instância em um campo, um loop pode acumular itens de pedidos diferentes. Crie um builder por objeto. O mesmo vale para concorrência: builders não são thread-safe. Não compartilhe o mesmo builder entre threads sem sincronização, e prefira tornar o builder de vida curta.

Lombok e geradores de código reduzem o boilerplate, mas não eliminam a necessidade de pensar nas invariantes. Um `@Builder` que não passa pelo construtor validado pode criar objetos inválidos. Se usar geração, aponte o builder para o construtor que valida, ou mantenha as regras no construtor canônico.

E quando **não** usar? Quando o objeto tem poucos campos, quando não há invariantes relevantes e quando a construção é interna e controlada. Builder também não é desculpa para aceitar qualquer combinação: se duas opções são mutuamente exclusivas, um tipo selado ou dois builders separados comunicam melhor. O padrão organiza a construção; ele não substitui a modelagem.

## Armadilhas comuns

- **Builder que valida só no `build()` e produto que aceita estado inválido.** Quem instancia o produto direto burla as regras. Valide no construtor canônico e deixe o builder delegar.
- **Guardar a lista mutável no produto.** `List.copyOf` ou uma cópia defensiva é obrigatório; caso contrário, o chamador altera o objeto depois de construído.
- **Builder com campos obrigatórios "combinados".** Se `cliente` é obrigatório, exija no construtor do builder ou use um builder em estágios. `build()` falhando em runtime é melhor que objeto inválido, mas o tipo ideal evita a chamada errada.
- **Reutilizar builder em loop.** O estado acumula. Um builder por construção evita itens duplicados e cupons vazando entre pedidos.

## Checklist de domínio

- [ ] Você identifica quando um objeto pode existir em estado inválido
- [ ] Você implementa builder com validação e cópia defensiva
- [ ] Você escolhe entre record, wither e builder sem cerimônia desnecessária
- [ ] Você reconhece os riscos de reutilização e concorrência do builder

## Para ir além

- [Builder](https://refactoring.guru/design-patterns/builder) — estrutura, variantes e relação com outros padrões.
- [Builder Pattern em Java](https://www.baeldung.com/java-builder-pattern) — implementações com classes, records e Lombok.
- [JEP 395: Records](https://openjdk.org/jeps/395) — contrato de imutabilidade, construtor compacto e cópia defensiva.
