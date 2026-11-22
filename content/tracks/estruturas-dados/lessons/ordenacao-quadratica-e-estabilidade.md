> **Em uma frase:** entender os sorts quadráticos é entender por que O(n log n) importa — e por que estabilidade pode valer mais que velocidade.

Bubble, selection e insertion sort são simples, mas insertion tem uma virtude que os outros não têm: é adaptativo e estável. Em arrays quase ordenados, ele vence até algoritmos sofisticados. Saber disso evita usar `Arrays.sort` onde um insertion resolveria com menos overhead.

## O problema

Um relatório precisa ordenar por departamento e, dentro dele, por nome. Se o sort não é estável, a ordem anterior se perde. Um array de 30 elementos quase ordenados não justifica o custo de um merge sort completo, mas um de 10 milhões jamais deve passar por bubble sort.

## Como funciona

| Algoritmo | Melhor | Médio | Pior | Estável | Memória |
|---|---|---|---|---|---|
| Bubble | O(n) | O(n²) | O(n²) | Sim | O(1) |
| Selection | O(n²) | O(n²) | O(n²) | Não | O(1) |
| Insertion | O(n) | O(n²) | O(n²) | Sim | O(1) |
| Merge | O(n log n) | O(n log n) | O(n log n) | Sim | O(n) |
| Quick | O(n log n) | O(n log n) | O(n²) | Não | O(log n) |

Insertion sort:

```java
static void insertionSort(int[] a) {
    for (int i = 1; i < a.length; i++) {
        int chave = a[i];
        int j = i - 1;
        while (j >= 0 && a[j] > chave) {
            a[j + 1] = a[j];
            j--;
        }
        a[j + 1] = chave;
    }
}
```

Estabilidade significa que elementos iguais mantêm a ordem relativa. Para objetos, compare apenas a chave de ordenação e preserve o restante.

```java
record Funcionario(String nome, String depto) {}

var porDepto = Comparator.comparing(Funcionario::depto);
var porNome  = Comparator.comparing(Funcionario::nome);
lista.sort(porDepto.thenComparing(porNome)); // composição explícita
```

## Na prática

`Arrays.sort(int[])` usa dual-pivot quicksort; `Arrays.sort(Object[])` e `List.sort` usam TimSort, estável e adaptativo. Para tipos primitivos, estabilidade não existe — não há identidade além do valor.

Quick sort é excelente para arrays em memória, mas o pior caso O(n²) aparece com pivô ruim. Use mediana de três ou randomização. Merge sort brilha em listas ligadas e ordenação externa.

## Armadilhas comuns

- Usar bubble sort em produção "porque é simples".
- Assumir que `Arrays.sort` é estável para primitivos.
- Comparador inconsistente com `equals`, quebrando `TreeMap` e `sort`.
- `Comparator` que subtrai inteiros e sofre overflow (`a - b`).
- Ordenar dentro de loop sem necessidade.

## Para ir além

Leia o javadoc de `Arrays.sort` e `Comparator`. Depois ordene 50 elementos quase ordenados com insertion e com `Arrays.sort`, medindo a diferença.
