> **Em uma frase:** um heap não ordena nada — ele só garante que o extremo esteja na raiz, e essa garantia parcial é o que entrega mínimo ou máximo em O(1) e atualizações em O(log n).

## O problema

Você tem um agendador que sempre precisa pegar a tarefa de maior prioridade, um stream que precisa devolver a mediana a cada leitura, ou 10 milhões de eventos dos quais só interessam os 100 maiores. Ordenar tudo a cada atualização custa O(n log n). O heap resolve os três casos com uma estrutura parcial: o extremo fica na raiz e o resto fica apenas suficientemente organizado para a próxima extração.

## Como funciona

Um heap é uma árvore binária completa em um array: filhos em `2i + 1` e `2i + 2`, pai em `(i - 1) / 2`. No min-heap, todo pai é menor ou igual aos filhos; não há ordem entre irmãos. `peek` é O(1), mas busca arbitrária é O(n).

| Operação | Custo | Por quê |
|---|---|---|
| `peek` | O(1) | o extremo está no índice 0 |
| `offer` | O(log n) | sift-up sobe pela altura |
| `poll` | O(log n) | sift-down desce pela altura |
| `build` | O(n) | heapify de baixo para cima |
| busca arbitrária | O(n) | a ordem parcial não ajuda |

Inserir n elementos custa O(n log n). Construir de um array custa O(n) com heapify de baixo para cima, porque a maioria dos nós está nas folhas e desce pouco.```java
import java.util.Arrays;

public class MinHeap {

    private int[] dados = new int[16];
    private int tamanho;

    public int size() {
        return tamanho;
    }

    public boolean isEmpty() {
        return tamanho == 0;
    }

    public void offer(int valor) {
        if (tamanho == dados.length) {
            dados = Arrays.copyOf(dados, dados.length * 2);
        }
        dados[tamanho] = valor;
        siftUp(tamanho);
        tamanho++;
    }

    public int peek() {
        if (tamanho == 0) {
            throw new IllegalStateException("heap vazio");
        }
        return dados[0];
    }

    public int poll() {
        int raiz = peek();
        tamanho--;
        dados[0] = dados[tamanho];
        if (tamanho > 0) {
            siftDown(0);
        }
        return raiz;
    }

    private void siftUp(int i) {
        while (i > 0) {
            int pai = (i - 1) / 2;
            if (dados[pai] <= dados[i]) {
                break;
            }
            trocar(pai, i);
            i = pai;
        }
    }

    private void siftDown(int i) {
        while (true) {
            int esquerda = 2 * i + 1;
            int direita = esquerda + 1;
            int menor = i;
            if (esquerda < tamanho && dados[esquerda] < dados[menor]) {
                menor = esquerda;
            }
            if (direita < tamanho && dados[direita] < dados[menor]) {
                menor = direita;
            }
            if (menor == i) {
                break;
            }
            trocar(i, menor);
            i = menor;
        }
    }

    private void trocar(int i, int j) {
        int temporario = dados[i];
        dados[i] = dados[j];
        dados[j] = temporario;
    }
}
```

O array cresce por dobra, então `offer` é O(1) amortizado sem sift e O(log n) no pior caso. `poll` desce pela altura. Um único heap garante apenas um extremo.

Para k-largest, a escolha contraintuitiva é um **min-heap de tamanho k**: ele mantém os k maiores e a raiz é o menor deles, o candidato a sair. Custo O(n log k) e memória O(k), contra O(n log n) e O(n) ao ordenar. Para a mediana, use um max-heap com a metade menor e um min-heap com a maior, com tamanhos diferindo em no máximo 1.

```java
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;

public class MedianaStream {

    private final PriorityQueue<Integer> menores =
            new PriorityQueue<>(Comparator.reverseOrder()); // max-heap
    private final PriorityQueue<Integer> maiores =
            new PriorityQueue<>();                          // min-heap

    public void adicionar(int valor) {
        if (menores.isEmpty() || valor <= menores.peek()) {
            menores.offer(valor);
        } else {
            maiores.offer(valor);
        }
        if (menores.size() > maiores.size() + 1) {
            maiores.offer(menores.poll());
        } else if (maiores.size() > menores.size()) {
            menores.offer(maiores.poll());
        }
    }

    public double mediana() {
        if (menores.isEmpty()) {
            throw new IllegalStateException("stream vazio");
        }
        if (menores.size() == maiores.size()) {
            return ((long) menores.peek() + maiores.peek()) / 2.0;
        }
        return menores.peek();
    }

    public static List<Integer> topK(int[] valores, int k) {
        if (k <= 0) {
            return List.of();
        }
        PriorityQueue<Integer> heap = new PriorityQueue<>(); // min-heap
        for (int valor : valores) {
            heap.offer(valor);
            if (heap.size() > k) {
                heap.poll();
            }
        }
        List<Integer> resultado = new ArrayList<>(heap);
        resultado.sort(Comparator.reverseOrder());
        return resultado;
    }

    public static void main(String[] args) {
        MedianaStream stream = new MedianaStream();
        for (int valor : new int[]{5, 15, 1, 3}) {
            stream.adicionar(valor);
        }
        System.out.println(stream.mediana()); // 4.0
        System.out.println(topK(new int[]{9, 4, 7, 1, 8, 2}, 3)); // [9, 8, 7]
    }
}
```

## Na prática

`PriorityQueue` é a implementação pronta: `offer`, `poll` e `peek` em O(log n)/O(1), mas não é thread-safe e sua iteração não é ordenada. Para concorrência, `PriorityBlockingQueue`; para cancelamento eficiente, um heap indexado guarda a posição de cada item e permite `remove` em O(log n).

Dijkstra é o caso clássico: o heap guarda `(distância, vértice)` e cada aresta gera um `offer`; o custo é O((V + E) log V). Com 1 milhão de arestas, isso é viável; uma varredura linear para o mínimo seria O(V²).

## Armadilhas comuns

- **Escrever `(a, b) -> a - b` como comparator.** A subtração estoura em valores extremos e inverte o resultado. Use `Integer.compare(a, b)`.
- **Mutar o campo usado na prioridade depois de inserir.** O heap não reposiciona o elemento; a raiz deixa de ser o mínimo.
- **Usar max-heap de tamanho n para top-k.** O min-heap de k é O(n log k) e usa O(k).

## Checklist de domínio

- [ ] Você implementa min-heap com array, sift-up e sift-down
- [ ] Você explica por que `build` é O(n)
- [ ] Você resolve top-k com min-heap de tamanho k
- [ ] Você mantém a mediana com dois heaps balanceados
- [ ] Você usa `Integer.compare` em comparators

## Para ir além

- [Oracle — PriorityQueue (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/PriorityQueue.html): contrato, ordem e notas de implementação.
- [LeetCode — Kth Largest Element in an Array](https://leetcode.com/problems/kth-largest-element-in-an-array/): compare heap e quickselect.
- [LeetCode — Find Median from Data Stream](https://leetcode.com/problems/find-median-from-data-stream/): pratique os dois heaps.
