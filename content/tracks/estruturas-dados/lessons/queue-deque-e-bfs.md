> **Em uma frase:** fila é a estrutura da ordem de chegada; em BFS, ela garante que ninguém a distância d+1 seja processado antes de alguém a distância d.

## O problema

Um serviço recebe pedidos e precisa processá-los na ordem em que chegaram. Um jogo precisa calcular o caminho mais curto de um personagem até uma saída em um labirinto. Um escalonador precisa dividir CPU entre tarefas sem starvation. Todos esses problemas compartilham FIFO: first in, first out. Usar uma pilha aqui inverteria a ordem e produziria resultados errados — o caminho encontrado por DFS não é necessariamente o mais curto, e um pedido antigo poderia ficar para sempre no fundo.

A fila parece trivial, mas a implementação em array tem uma armadilha: se você remove do início e desloca todo mundo, o custo é O(n) por remoção. A solução é o **array circular**, em que `head` e `tail` avançam com módulo e reaproveitam o espaço liberado. É o mesmo princípio do `ArrayDeque` e dos ring buffers usados em redes e áudio.

## Como funciona

Uma fila tem `enqueue` (entra no fim), `dequeue` (sai do início), `peek` (consulta o início) e `isEmpty`. Todas O(1). Em um array circular de capacidade fixa, você mantém:

- `head`: índice do primeiro elemento.
- `tail`: índice do próximo slot livre.
- `tamanho`: quantidade atual (ou um slot vazio para distinguir cheia de vazia).

Com contador, a lógica é direta: cheia quando `tamanho == capacidade`; vazia quando `tamanho == 0`; avanço com `(i + 1) % capacidade`. O código abaixo implementa a fila e a usa para BFS em uma grade, onde cada célula é um nó e as arestas ligam vizinhos ortogonais.

```java
public class FilaCircular {
    private final int[] dados;
    private int head;
    private int tail;
    private int tamanho;

    public FilaCircular(int capacidade) {
        if (capacidade < 1) {
            throw new IllegalArgumentException("capacidade deve ser >= 1");
        }
        dados = new int[capacidade];
    }

    public boolean enqueue(int valor) {
        if (tamanho == dados.length) {
            return false; // fila cheia; em produção, avalie crescer ou bloquear
        }
        dados[tail] = valor;
        tail = (tail + 1) % dados.length;
        tamanho++;
        return true;
    }

    public int dequeue() {
        if (isEmpty()) {
            throw new IllegalStateException("dequeue em fila vazia");
        }
        int valor = dados[head];
        head = (head + 1) % dados.length;
        tamanho--;
        return valor;
    }

    public int peek() {
        if (isEmpty()) {
            throw new IllegalStateException("peek em fila vazia");
        }
        return dados[head];
    }

    public boolean isEmpty() {
        return tamanho == 0;
    }

    public int size() {
        return tamanho;
    }

    public static void main(String[] args) {
        FilaCircular f = new FilaCircular(3);
        f.enqueue(1);
        f.enqueue(2);
        f.enqueue(3);
        System.out.println(f.enqueue(4)); // false, cheia
        System.out.println(f.dequeue());  // 1
        System.out.println(f.dequeue());  // 2
    }
}
```

Sem o contador `tamanho`, `head == tail` é ambíguo: pode significar vazia ou cheia. A alternativa clássica é deixar um slot sempre vazio, mas isso desperdiça capacidade e complica o cálculo do tamanho. Em Java, `ArrayDeque` usa a abordagem com head/tail e cresce dobrando; para uma fila limitada, o contador é mais simples e não deixa dúvida.

## Na prática

BFS é o algoritmo que dá sentido à fila. Você começa na origem, enfileira, marca como visitada e processa em ordem. Cada vizinho não visitado entra na fila com `distância + 1`. Quando o destino sai, a distância é mínima, porque todos os nós a distância d foram processados antes dos de d+1. O código abaixo resolve o caminho mais curto em uma grade com obstáculos.

```java
import java.util.ArrayDeque;
import java.util.Queue;

public class Labirinto {

    private static final int[] DX = {-1, 1, 0, 0};
    private static final int[] DY = {0, 0, -1, 1};

    // 'S' origem, 'E' destino, '#' parede, '.' livre.
    // Retorna a menor distância ou -1 se não houver caminho.
    public static int menorCaminho(char[][] grade) {
        int linhas = grade.length;
        int colunas = grade[0].length;
        int[] inicio = new int[2];
        for (int i = 0; i < linhas; i++) {
            for (int j = 0; j < colunas; j++) {
                if (grade[i][j] == 'S') {
                    inicio[0] = i;
                    inicio[1] = j;
                }
            }
        }

        boolean[][] visitado = new boolean[linhas][colunas];
        Queue<int[]> fila = new ArrayDeque<>();
        fila.offer(new int[]{inicio[0], inicio[1], 0});
        visitado[inicio[0]][inicio[1]] = true; // marca ao enfileirar

        while (!fila.isEmpty()) {
            int[] atual = fila.poll();
            int x = atual[0], y = atual[1], dist = atual[2];
            if (grade[x][y] == 'E') {
                return dist;
            }
            for (int d = 0; d < 4; d++) {
                int nx = x + DX[d];
                int ny = y + DY[d];
                if (nx < 0 || ny < 0 || nx >= linhas || ny >= colunas) {
                    continue;
                }
                if (visitado[nx][ny] || grade[nx][ny] == '#') {
                    continue;
                }
                visitado[nx][ny] = true;
                fila.offer(new int[]{nx, ny, dist + 1});
            }
        }
        return -1;
    }

    public static void main(String[] args) {
        char[][] grade = {
            {'S', '.', '#'},
            {'.', '.', '.'},
            {'#', '.', 'E'}
        };
        System.out.println(menorCaminho(grade)); // 4
    }
}
```

Marcar como visitado **ao enfileirar**, e não ao desenfileirar, evita que o mesmo nó entre várias vezes na fila. Em uma grade aberta, a diferença é entre O(V) e potencialmente O(V²) entradas. A distância armazenada no array de três posições é uma opção didática; em código de produção, use uma matriz `int[][] dist` inicializada com -1, que também serve para reconstruir o caminho.

Deque (double-ended queue) generaliza a fila: você pode inserir e remover nas duas pontas em O(1). Isso resolve janelas deslizantes com máximo (guarde índices em ordem decrescente), BFS 0-1 (insira no início para aresta de peso 0 e no fim para peso 1) e o cache LRU (mova para o início). `ArrayDeque` é a implementação padrão; ela não aceita `null` e é mais rápida que `LinkedList`.

## Armadilhas comuns

- **Deslocar o array na remoção.** `System.arraycopy` a cada dequeue transforma a fila em O(n). Use índices circulares.
- **Marcar visitado tarde.** Se você só marca ao desenfileirar, o mesmo nó pode ser enfileirado várias vezes; em grafos densos, a memória explode.
- **Usar `LinkedList` como fila.** Funciona, mas cada nó é um objeto e a localidade é pior; `ArrayDeque` é a escolha padrão.
- **Confundir BFS com caminho mínimo em grafos ponderados.** BFS minimiza número de arestas. Com pesos diferentes, use Dijkstra.
- **`head`/`tail` sem módulo.** Ao chegar ao fim do array, o índice precisa voltar a zero; sem isso, você estoura o array ou deixa slots inutilizados.

## Para ir além

- [Oracle — ArrayDeque](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayDeque.html): implementação e contrato de deque.
- [LeetCode — Number of Islands](https://leetcode.com/problems/number-of-islands/): BFS/DFS em grade.
- [CP-Algorithms — BFS](https://cp-algorithms.com/graph/bfs.html): prova de corretude e variantes.
