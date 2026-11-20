> **Em uma frase:** Polimorfismo é a JVM escolher o método pela classe real do objeto em tempo de execução, permitindo que o chamador dependa do contrato e não da implementação.

## O problema

Um checkout tinha `if (metodo.equals("CARTAO")) { ... } else if (metodo.equals("PIX")) { ... }`. Cada novo meio de pagamento exigia alterar o mesmo método, recompilar tudo e testar os caminhos antigos. Quando apareceu "BOLETO", alguém esqueceu de atualizar o cálculo de taxa em outro ponto do sistema.

Com polimorfismo, cada meio de pagamento implementa o contrato `Pagamento` e o checkout percorre uma lista. Adicionar boleto é adicionar uma classe; o loop não muda. O `switch` infinito vira uma hierarquia aberta para extensão e fechada para modificação.

## Como funciona

O tipo da variável decide o que o compilador permite chamar. O tipo real do objeto decide qual implementação executa. `Pagamento p = new Pix(); p.valorLiquido(1000)` compila porque `Pagamento` declara `valorLiquido`; executa o método de `Pix` porque o objeto é um `Pix`.

A JVM usa despacho dinâmico para métodos de instância sobrescritos. Não é reflection nem interpretação de string: a resolução é otimizada e, depois do JIT, próxima do custo de uma chamada direta.

```java
import java.util.List;

public class Checkout {
    interface Pagamento {
        long valorLiquidoCentavos(long brutoCentavos);
        String nome();
    }

    static final class Pix implements Pagamento {
        public long valorLiquidoCentavos(long bruto) { return bruto; }
        public String nome() { return "PIX"; }
    }

    static final class Cartao implements Pagamento {
        public long valorLiquidoCentavos(long bruto) {
            return bruto - Math.round(bruto * 0.0299); // 2,99%
        }
        public String nome() { return "CARTAO"; }
    }

    static final class Boleto implements Pagamento {
        public long valorLiquidoCentavos(long bruto) {
            return bruto - 350; // taxa fixa de R$ 3,50
        }
        public String nome() { return "BOLETO"; }
    }

    public static void main(String[] args) {
        List<Pagamento> meios = List.of(new Pix(), new Cartao(), new Boleto());
        for (Pagamento p : meios) {
            System.out.printf("%s: %d centavos%n", p.nome(), p.valorLiquidoCentavos(10_000));
        }
        // PIX: 10000 | CARTAO: 9701 | BOLETO: 9650
    }
}
```

Regras de sobrescrita: a assinatura precisa ser compatível; o retorno pode ser covariante (um subtipo); a visibilidade não pode diminuir; `final`, `static` e `private` não podem ser sobrescritos. `static` é ocultado, não sobrescrito: a chamada usa o tipo da variável, não o tipo do objeto.

`@Override` não altera o comportamento. Ele faz o compilador verificar que existe um método compatível na superclasse. Sem a anotação, um erro de digitação em `hashCode` vira um método novo e o bug passa.

## Na prática

Todo objeto herda de `Object` e, portanto, herda `equals`, `hashCode` e `toString`. Sobrescrever esses métodos é parte do contrato de valor:

```java
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public class Produto {
    private final String sku;
    private final String nome;

    public Produto(String sku, String nome) {
        this.sku = Objects.requireNonNull(sku);
        this.nome = Objects.requireNonNull(nome);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Produto outro)) return false;
        return sku.equals(outro.sku);
    }

    @Override
    public int hashCode() {
        return Objects.hash(sku);
    }

    @Override
    public String toString() {
        return "Produto[" + sku + ", " + nome + "]";
    }

    public static void main(String[] args) {
        Set<Produto> catalogo = new HashSet<>();
        catalogo.add(new Produto("A1", "Teclado"));
        catalogo.add(new Produto("A1", "Teclado Mecânico"));
        System.out.println(catalogo.size()); // 1: mesmo SKU, mesmo produto
    }
}
```

`equals` deve ser reflexivo, simétrico, transitivo, consistente e tratar `null`. `hashCode` deve ser estável durante a vida do objeto e igual para objetos iguais. Usar `getClass()` no `equals` impede comparação entre subclasses; usar `instanceof` permite, mas exige cuidado com simetria. Em hierarquias com estado adicional, muitas vezes é melhor não sobrescrever `equals` ou usar composição.

## Armadilhas comuns

- **Sobrescrever `equals` sem `hashCode`.** Dois objetos iguais podem cair em buckets diferentes e o `HashSet` não os encontra.
- **Incluir campos mutáveis em `equals`/`hashCode`.** Se o objeto muda depois de inserido em um `HashMap`, a busca falha. Use chaves imutáveis.
- **Chamar método sobrescritível no construtor.** A subclasse pode ver estado ainda não inicializado. Evite ou torne o método `final`.
- **`toString` com dados sensíveis.** Logs de produção não devem conter senha, token ou CPF completo; sobrescreva com cuidado.

## Checklist de domínio

- [ ] Você explica despacho dinâmico com um exemplo de variável de interface
- [ ] Você aplica as regras de sobrescrita e usa `@Override` sempre
- [ ] Você implementa `equals`/`hashCode` coerentes e testa em `HashSet`
- [ ] Você identifica quando um `if/else` por tipo pede polimorfismo

## Para ir além

- [dev.java — Overriding and Hiding Methods](https://dev.java/learn/classes-objects/inheritance/): regras de sobrescrita e métodos estáticos.
- [Java SE 21 API — Object](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Object.html): contrato de `equals`, `hashCode` e `toString`.
- [Baeldung — Java equals() and hashCode() Contracts](https://www.baeldung.com/java-equals-hashcode-contracts): os cinco requisitos e erros comuns.
