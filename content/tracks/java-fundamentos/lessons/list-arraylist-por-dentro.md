> **Em uma frase:** `ArrayList` é um array que cresce: acesso por índice é O(1), inserir ou remover no meio é O(n), e muitas surpresas vêm de listas que parecem mutáveis mas não são.

## O problema

Uma API de catálogo montava a resposta com `lista.add(0, produto)` para manter os itens mais recentes no início. Com 50 mil produtos, o endpoint passou de 40 ms para 2,3 segundos. O código parecia uma chamada trivial; por baixo, cada inserção deslocava todos os elementos já presentes.

List é a coleção mais usada em Java e a mais mal compreendida. Saber o que acontece por baixo muda a escolha entre `ArrayList`, `LinkedList`, `List.of` e uma fila — e explica por que certas operações são baratas em um teste de 10 elementos e caras em produção.

## Como funciona

A hierarquia é `Iterable -> Collection -> List`. List é ordenada, aceita duplicatas e oferece acesso por índice. `ArrayList` mantém um array de `Object[]` interno. `get(i)` é O(1); `add(e)` no fim é O(1) amortizado, porque ocasionalmente o array é copiado para uma capacidade maior; `add(0, e)` é O(n), porque desloca tudo.

O crescimento não dobra: a implementação usa `oldCapacity + (oldCapacity >> 1)`, ou seja, 1,5x. A capacidade inicial padrão é 10, mas o array só é alocado no primeiro `add`. Se você sabe que vai inserir 100 mil elementos, `new ArrayList<>(100_000)` evita cerca de 30 realocações e cópias.

```java
import java.util.ArrayList;
import java.util.List;

public class Catalogo {
    public static void main(String[] args) {
        List<String> produtos = new ArrayList<>(4);
        produtos.add("teclado");
        produtos.add("mouse");
        produtos.add("monitor");

        System.out.println(produtos.get(1));      // mouse, O(1)
        System.out.println(produtos.contains("monitor")); // true, O(n)

        produtos.remove(1); // remove o ÍNDICE 1 (mouse)
        System.out.println(produtos); // [teclado, monitor]

        List<Integer> numeros = new ArrayList<>(List.of(10, 20, 30));
        numeros.remove(Integer.valueOf(20)); // remove o VALOR 20
        System.out.println(numeros); // [10, 30]
    }
}
```

A sobrecarga `remove(int index)` e `remove(Object o)` é uma das armadilhas mais clássicas. Com `List<Integer>`, `remove(2)` remove o elemento no índice 2; para remover o valor 2, use `remove(Integer.valueOf(2))`. O compilador escolhe a versão mais específica, e `int` vence.

## Na prática

Nem toda `List` é mutável. `List.of(...)` cria uma lista imutável: `add`, `set` e `remove` lançam `UnsupportedOperationException`. `Arrays.asList(array)` cria uma lista de tamanho fixo, mas com `set` permitido; ela é uma **view** do array original, então alterar um reflete no outro.

`subList(from, to)` também é uma view, não uma cópia. Alterações na sublista afetam a original, e alterações estruturais na original invalidam a sublista com `ConcurrentModificationException`.

```java
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class Views {
    public static void main(String[] args) {
        String[] array = {"a", "b", "c"};
        List<String> fixa = Arrays.asList(array);
        fixa.set(0, "z");
        System.out.println(array[0]); // z: é a mesma memória

        List<String> original = new ArrayList<>(List.of("a", "b", "c", "d"));
        List<String> parte = original.subList(1, 3);
        parte.set(0, "B");
        System.out.println(original); // [a, B, c, d]

        // parte.add("x") alteraria a original; evite views se for modificar.

        List<String> copia = List.copyOf(original); // imutável e independente
        System.out.println(copia); // [a, B, c, d]
    }
}
```

Para inserir e remover muito nas pontas, `ArrayDeque` é melhor que `LinkedList`. Para acesso aleatório frequente, `ArrayList` ganha. `LinkedList` tem nós espalhados pelo heap, o que prejudica a localidade de cache; na prática, costuma perder para `ArrayList` mesmo em remoções no meio quando o custo de encontrar o nó é incluído.

## Armadilhas comuns

- **`Arrays.asList` tratada como lista totalmente mutável.** `add` lança exceção e o `set` altera o array original. Use `new ArrayList<>(Arrays.asList(...))` quando precisar de independência.
- **Remover com `remove(int)` sem querer.** Em `List<Integer>`, o índice vence. Use `remove(Integer.valueOf(valor))`.
- **Modificar a lista durante o for-each.** `ConcurrentModificationException`, mesmo em single-thread. Use `removeIf` ou `Iterator.remove`.
- **Assumir thread safety.** `ArrayList` não é sincronizado. Compartilhar entre threads sem sincronização produz estado corrompido e exceções intermitentes.

## Checklist de domínio

- [ ] Você explica a complexidade de `get`, `add` no fim e `add(0, e)`
- [ ] Você diferencia lista imutável, tamanho fixo e view
- [ ] Você evita a ambiguidade de `remove` com `List<Integer>`
- [ ] Você escolhe `ArrayList`, `ArrayDeque` ou `LinkedList` com justificativa

## Para ir além

- [dev.java — The Collections Framework](https://dev.java/learn/collections/): visão geral das interfaces e implementações.
- [Java SE 21 API — ArrayList](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayList.html): detalhes de capacidade e operações.
- [Baeldung — ArrayList vs LinkedList](https://www.baeldung.com/java-arraylist-vs-linkedlist): complexidades e desempenho real.
