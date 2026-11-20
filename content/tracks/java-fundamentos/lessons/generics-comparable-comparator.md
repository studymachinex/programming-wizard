> **Em uma frase:** Genéricos movem erros de tipo do runtime para o compilador; `Comparable` define a ordem natural e `Comparator` permite ordens externas sem tocar na classe.

## O problema

Antes dos genéricos, uma lista guardava `Object`. Um relatório fazia `List vendas = new ArrayList(); vendas.add("total");` e, na hora de somar, recebia `ClassCastException` em produção. O compilador não tinha informação para impedir o erro.

Hoje, `List<Venda>` impede isso na compilação. Mas generics têm limites: `new T[]` não compila, `list instanceof List<String>` não funciona e wildcards confundem. Entender **type erasure** e o princípio PECS evita tanto casts desnecessários quanto APIs genéricas impossíveis de usar.

## Como funciona

Um tipo genérico é um parâmetro de tipo verificado em tempo de compilação. `List<String>` garante que só Strings entram e saem. Em runtime, a JVM vê apenas `List`; o compilador insere casts nos pontos de leitura. Isso é **type erasure**.

Consequências práticas: não existe `new T()`, `new T[]` ou `T.class`; não se pode sobrecarregar `metodo(List<String>)` e `metodo(List<Integer>)`; arrays genéricos não são seguros. Em troca, você ganha segurança de tipo sem custo de boxing adicional além do necessário.

```java
import java.util.ArrayList;
import java.util.List;

public class Caixa<T> {
    private final List<T> itens = new ArrayList<>();

    public void adicionar(T item) {
        itens.add(item);
    }

    public T primeiro() {
        if (itens.isEmpty()) throw new IllegalStateException("caixa vazia");
        return itens.get(0);
    }

    // Producer: aceita qualquer lista que produza Number
    public static double somar(List<? extends Number> valores) {
        double total = 0;
        for (Number n : valores) total += n.doubleValue();
        return total;
    }

    public static void main(String[] args) {
        Caixa<String> caixa = new Caixa<>();
        caixa.adicionar("java");
        System.out.println(caixa.primeiro()); // java

        System.out.println(somar(List.of(1, 2, 3, 4)));      // 10.0
        System.out.println(somar(List.of(1.5, 2.5, 3.0)));  // 7.0
    }
}
```

`List<? extends Number>` é um **producer**: você lê elementos como `Number`, mas não pode adicionar, porque o compilador não sabe se a lista real é de `Integer`, `Double` ou outra subclasse. `List<? super Integer>` é um **consumer**: aceita `Integer`, mas a leitura só garante `Object`. O mnemônico é PECS: Producer Extends, Consumer Super.

## Na prática

`Comparable<T>` define a ordem natural dentro da própria classe. `Comparator<T>` define uma ordem externa e permite várias. Use `Comparable` quando existe uma ordenação óbvia e estável — dinheiro por valor, datas cronologicamente. Use `Comparator` quando a ordem depende do contexto — nome, preço, popularidade.

```java
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class Ordenacao {
    static final class Produto implements Comparable<Produto> {
        private final String nome;
        private final long precoCentavos;

        Produto(String nome, long precoCentavos) {
            this.nome = nome;
            this.precoCentavos = precoCentavos;
        }

        public String nome() { return nome; }
        public long precoCentavos() { return precoCentavos; }

        @Override
        public int compareTo(Produto outro) {
            return Long.compare(this.precoCentavos, outro.precoCentavos);
        }

        @Override
        public String toString() { return nome + "=" + precoCentavos; }
    }

    public static void main(String[] args) {
        List<Produto> produtos = new ArrayList<>(List.of(
            new Produto("teclado", 25_000),
            new Produto("mouse", 8_000),
            new Produto("monitor", 120_000)
        ));

        Collections.sort(produtos); // ordem natural: preço
        System.out.println(produtos); // [mouse=8000, teclado=25000, monitor=120000]

        produtos.sort(Comparator.comparing(Produto::nome)
            .thenComparingLong(Produto::precoCentavos));
        System.out.println(produtos); // [monitor=120000, mouse=8000, teclado=25000]

        Comparator<Produto> precoDesc = Comparator
            .comparingLong(Produto::precoCentavos)
            .reversed();
        produtos.sort(precoDesc);
        System.out.println(produtos); // [monitor=120000, teclado=25000, mouse=8000]
    }
}
```

O contrato de `compareTo` exige consistência: se `a.compareTo(b) == 0`, idealmente `a.equals(b)` é true. `TreeSet` e `TreeMap` usam a comparação para unicidade; se `compareTo` retorna zero para objetos diferentes, o segundo é descartado. Isso é uma fonte real de perda de dados.

## Armadilhas comuns

- **Usar tipos crus (`List` sem parâmetro).** O compilador perde a checagem e emite warnings. Tipos crus existem por compatibilidade, não como escolha.
- **Achar que `List<Object>` aceita `List<String>`.** Invariância: `List<String>` não é subtipo de `List<Object>`. Use wildcards para flexibilizar.
- **Comparar com subtração.** `return this.id - outro.id` estoura com inteiros grandes. Use `Integer.compare` ou `Long.compare`.
- **`Comparator` inconsistente com `equals` em `TreeSet`.** O conjunto pode tratar dois objetos diferentes como iguais e descartar um deles.

## Checklist de domínio

- [ ] Você explica type erasure e o que não é possível fazer por causa dela
- [ ] Você aplica PECS sem decorar a regra errada
- [ ] Você escolhe `Comparable` ou `Comparator` conforme a ordem ser intrínseca ou contextual
- [ ] Você escreve comparadores com `comparing`, `thenComparing` e `reversed`

## Para ir além

- [dev.java — Generics](https://dev.java/learn/generics/): tipos genéricos, wildcards e limites.
- [Java SE 21 API — Comparator](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Comparator.html): fábricas e composição de ordem.
- [Baeldung — Comparator and Comparable in Java](https://www.baeldung.com/java-comparator-comparable): exemplos lado a lado.
