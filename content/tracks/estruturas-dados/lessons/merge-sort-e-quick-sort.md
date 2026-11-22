> **Em uma frase:** merge sort compra um O(n log n) garantido e estável com memória auxiliar; quick sort compra velocidade in-place com um pior caso que você precisa saber domar.

## O problema

Ordenar um milhão de inteiros com um algoritmo quadrático exige quase um trilhão de comparações — minutos, não milissegundos. A partir de alguns milhares de elementos, a diferença entre O(n²) e O(n log n) deixa de ser acadêmica: é a diferença entre um relatório que sai e um job que estoura o timeout. Os dois algoritmos que resolvem isso em O(n log n) atacam o problema por caminhos opostos. Merge sort divide o array e combina resultados; quick sort particiona o array e resolve as partes sem combinar nada.

A escolha depende de três perguntas: você precisa de estabilidade, pode pagar memória extra e o dado pode ser adversarial? O Java responde de formas diferentes para `int[]` e `String[]`.

## Como funciona

Merge sort segue a receita de dividir para conquistar. Corte o array ao meio, ordene cada metade recursivamente e intercale as duas metades ordenadas em uma passada linear. A recorrência é `T(n) = 2T(n/2) + Θ(n)`, que resolve para `Θ(n log n)` em todos os casos — melhor, médio e pior. O custo escondido é o buffer de intercalação: `Θ(n)` de memória extra. A estabilidade vem de um detalhe pequeno: em empates, pegue sempre o elemento da metade esquerda.

Duas otimizações aparecem em produção: cortar para insertion sort em faixas de até 16–32 elementos e pular o merge quando a última chave da esquerda já é menor ou igual à primeira da direita. O código abaixo aplica a segunda; o corte por insertion fica como exercício.

```java
import java.util.Arrays;

public class MergeSort {

    public static void ordenar(int[] a) {
        if (a.length < 2) return;
        int[] buffer = new int[a.length]; // alocado uma vez, não a cada merge
        ordenar(a, buffer, 0, a.length);
    }

    private static void ordenar(int[] a, int[] buffer, int lo, int hi) {
        if (hi - lo < 2) return;
        int mid = lo + (hi - lo) / 2;
        ordenar(a, buffer, lo, mid);
        ordenar(a, buffer, mid, hi);
        if (a[mid - 1] <= a[mid]) return; // já ordenado: evita o merge
        merge(a, buffer, lo, mid, hi);
    }

    private static void merge(int[] a, int[] buffer, int lo, int mid, int hi) {
        System.arraycopy(a, lo, buffer, lo, hi - lo);
        int i = lo, j = mid, k = lo;
        while (i < mid && j < hi) {
            // <= preserva a ordem relativa dos iguais: estabilidade
            if (buffer[i] <= buffer[j]) a[k++] = buffer[i++];
            else a[k++] = buffer[j++];
        }
        while (i < mid) a[k++] = buffer[i++];
        while (j < hi) a[k++] = buffer[j++];
    }

    public static void main(String[] args) {
        int[] a = {5, 2, 9, 2, -1, 7};
        ordenar(a);
        System.out.println(Arrays.toString(a)); // [-1, 2, 2, 5, 7, 9]
    }
}
```

Quick sort escolhe um pivô, reorganiza o array para que menores fiquem à esquerda e maiores à direita, e recursa nos dois lados. A partição custa `Θ(n)` e, se o pivô dividir bem, a recorrência é a mesma do merge sort. O problema é o "se": pivô fixo no primeiro elemento degenera em `O(n²)` com array já ordenado, porque uma partição fica vazia e a outra com `n-1`. Pivô aleatório torna esse cenário improvável, mas não impossível. A partição de três vias (holandesa) resolve o outro vilão: muitos valores iguais, que fazem partições desbalanceadas mesmo com pivô aleatório.

```java
import java.util.concurrent.ThreadLocalRandom;

public class QuickSort {

    public static void ordenar(int[] a) {
        if (a.length > 1) ordenar(a, 0, a.length - 1);
    }

    private static void ordenar(int[] a, int lo, int hi) {
        if (lo >= hi) return;
        int pivo = a[ThreadLocalRandom.current().nextInt(lo, hi + 1)];
        // [lo, lt) < pivo | [lt, i) == pivo | (gt, hi] > pivo
        int lt = lo, i = lo, gt = hi;
        while (i <= gt) {
            if (a[i] < pivo) troca(a, lt++, i++);
            else if (a[i] > pivo) troca(a, i, gt--);
            else i++;
        }
        ordenar(a, lo, lt - 1);
        ordenar(a, gt + 1, hi);
    }

    private static void troca(int[] a, int i, int j) {
        int tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
    }
}
```

## Na prática

A JDK escolhe por tipo. `Arrays.sort(int[])` usa uma variante de quicksort com pivôs duplos, porque primitivos não têm identidade e estabilidade é irrelevante; já `Arrays.sort(Object[])` usa TimSort, um merge sort adaptativo e estável, porque reordenar objetos iguais pode trocar a ordem de campos que você não está comparando.

Merge sort brilha quando o dado não cabe na memória, quando você precisa de estabilidade ou quando o pior caso não pode variar. Quick sort brilha com primitivos, arrays grandes e memória apertada: constantes menores e nenhum buffer. Se o dado pode ser adversarial, use pivô aleatório mais um limite de profundidade que cai para heapsort — a receita do introsort.

## Armadilhas comuns

- **Usar `<` no merge em vez de `<=`.** Isso quebra a estabilidade sem quebrar a ordenação; o bug só aparece em empates com dados compostos.
- **Pivô fixo no primeiro ou último elemento.** Array ordenado ou inverso produz `O(n²)` e profundidade de recursão `n`.
- **Ignorar duplicatas no quicksort.** Mesmo com pivô aleatório, muitos iguais geram partições ruins; use três vias.
- **Alocar o buffer dentro de cada merge.** O algoritmo aloca `O(n log n)` e pressiona o GC.
- **Testar apenas entrada aleatória.** Inclua ordenado, reverso, todos iguais, vazio e um elemento.

## Para ir além

- [Java 21 — `Arrays.sort`](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html): contratos de estabilidade e variantes.
- [Visualgo — Sorting](https://visualgo.net/en/sorting): animações de merge e quick sort.
- [LeetCode — Sort an Array](https://leetcode.com/problems/sort-an-array/): implemente ambos e compare constantes.
