> **Em uma frase:** Lambda é uma função sem nome que implementa uma interface funcional; Stream é um pipeline declarativo e preguiçoso que só executa quando uma operação terminal é chamada.

## O problema

Um relatório percorria uma lista de vendas com três loops aninhados, `if` de filtro, `Map` de agrupamento e `Collections.sort`. Funcionava, mas cada nova regra aumentava o nível de aninhamento e o teste ficava mais difícil. O código dizia **como** calcular, não **o que** queria.

Stream não é sinônimo de código melhor. Um `for` simples continua sendo a escolha certa para muitas tarefas. O ganho aparece quando você tem transformação, filtro, agrupamento e ordenação encadeados — e quando a legibilidade do pipeline é maior que a do loop.

## Como funciona

Uma **interface funcional** tem um único método abstrato. `Function<T,R>`, `Predicate<T>`, `Consumer<T>` e `Supplier<T>` são as mais comuns. Uma lambda `x -> x * 2` é uma implementação concisa dessa interface; o tipo é inferido pelo contexto.

```java
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Predicate;

public class Lambdas {
    public static void main(String[] args) {
        List<String> nomes = new ArrayList<>(List.of("Ana", "Bruno", "Carla", "  "));

        nomes.removeIf(String::isBlank); // method reference
        nomes.sort(Comparator.comparing(String::length).thenComparing(Comparator.naturalOrder()));
        System.out.println(nomes); // [Ana, Bruno, Carla]

        Predicate<String> curto = s -> s.length() <= 4;
        nomes.removeIf(curto.negate());
        System.out.println(nomes); // [Ana]
    }
}
```

Lambdas capturam variáveis locais apenas se elas forem **efetivamente finais**: não podem ser reatribuídas depois da captura. Isso evita condições de corrida surpresa. Campos de instância podem ser alterados, mas cuidado com efeitos colaterais em pipelines paralelos.

Um **Stream** tem três partes: fonte (`list.stream()`, `Stream.of`, `IntStream.range`), operações intermediárias (`filter`, `map`, `sorted`, `distinct`, `limit`) e uma operação terminal (`collect`, `forEach`, `count`, `reduce`, `anyMatch`). Sem terminal, nada executa. Cada stream só pode ser consumida uma vez.

```java
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class Vendas {
    record Venda(String categoria, long valorCentavos) {}

    public static void main(String[] args) {
        List<Venda> vendas = List.of(
            new Venda("livros", 4_500),
            new Venda("livros", 3_000),
            new Venda("games", 20_000),
            new Venda("games", 15_000),
            new Venda("papelaria", 1_200)
        );

        Map<String, Long> totalPorCategoria = vendas.stream()
            .collect(Collectors.groupingBy(
                Venda::categoria,
                Collectors.summingLong(Venda::valorCentavos)));

        System.out.println(totalPorCategoria); // {papelaria=1200, games=35000, livros=7500}

        List<String> top = totalPorCategoria.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .limit(2)
            .map(e -> e.getKey() + ": " + e.getValue())
            .toList();

        System.out.println(top); // [games: 35000, livros: 7500]
    }
}
```

`groupingBy` cria um `Map`; `summingLong` reduz cada grupo a um total. `sorted` com `comparingByValue().reversed()` ordena do maior para o menor. `toList()` devolve uma lista imutável desde Java 16.

## Na prática

`map` transforma um elemento em outro. `flatMap` transforma cada elemento em uma stream e achata o resultado. Se você tem `List<Pedido>` e cada pedido tem `List<Item>`, `flatMap(p -> p.itens().stream())` produz uma stream de todos os itens.

```java
import java.util.List;

public class FlatMap {
    record Item(String nome) {}
    record Pedido(List<Item> itens) {}

    public static void main(String[] args) {
        List<Pedido> pedidos = List.of(
            new Pedido(List.of(new Item("teclado"), new Item("mouse"))),
            new Pedido(List.of(new Item("monitor")))
        );

        List<String> nomes = pedidos.stream()
            .flatMap(p -> p.itens().stream())
            .map(Item::nome)
            .distinct()
            .sorted()
            .toList();

        System.out.println(nomes); // [monitor, mouse, teclado]
    }
}
```

Streams são preguiçosas: `filter` e `map` não processam nada até o terminal. Isso permite que `findFirst()` pare cedo em uma lista grande, mas também significa que um `peek` sem terminal não executa. Não use `peek` para lógica de negócio; ele é para depuração.

`parallelStream()` não é acelerador automático. Ele usa o `ForkJoinPool` comum, compartilhado com outras tarefas, e só compensa com volume alto, operações CPU-bound e nenhum estado mutável compartilhado. Para I/O, uma API assíncrona é melhor.

## Armadilhas comuns

- **Reutilizar uma Stream.** Depois do terminal, ela está consumida e lança `IllegalStateException`. Crie outra a partir da fonte.
- **Efeitos colaterais em `forEach`.** Adicionar a uma lista externa dentro de `parallelStream` pode corromper dados. Use `collect`.
- **`Collectors.toMap` com chave duplicada.** Lança `IllegalStateException`; forneça a função de merge ou use `groupingBy`.
- **Stream para tudo.** Um loop de três linhas pode ser mais claro que um pipeline de oito. Otimize para quem lê.

## Checklist de domínio

- [ ] Você diferencia operação intermediária de terminal e explica a preguiça
- [ ] Você usa `map` e `flatMap` no caso certo
- [ ] Você agrupa e soma com `Collectors`
- [ ] Você evita efeitos colaterais e reutilização de streams

## Para ir além

- [dev.java — Lambdas](https://dev.java/learn/lambdas/): interfaces funcionais e sintaxe.
- [dev.java — Streams](https://dev.java/learn/streams/): pipeline, coletores e redução.
- [Baeldung — Java 8 Streams](https://www.baeldung.com/java-8-streams): exemplos de cada operação.
