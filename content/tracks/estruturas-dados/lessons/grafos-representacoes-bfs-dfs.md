> **Em uma frase:** lista de adjacência guarda só as arestas que existem, e BFS/DFS percorrem esse grafo em O(V + E) — a diferença está na ordem de exploração e no que ela prova.

## O problema

Grafos modelam dependências de build, amizades, rotas, redes elétricas e chamadas entre serviços. A primeira decisão é como representá-los. Uma matriz de adjacência com 100 mil vértices ocupa 10¹⁰ posições: dezenas de gigabytes, mesmo com bitset, para guardar apenas 200 mil arestas. A lista de adjacência guarda exatamente o que existe e reduz o custo a O(V + E). Em troca, responder "existe aresta entre u e v?" deixa de ser O(1).

A segunda, o percurso. BFS responde distância mínima em número de arestas; DFS responde conectividade, componentes e ciclos. Ambos são O(V + E), mas erros de marcação transformam um percurso linear em uma explosão de visitas repetidas.

## Como funciona

Na lista de adjacência, cada vértice aponta para seus vizinhos. Em grafo não direcionado, cada aresta aparece duas vezes; em direcionado, uma. O custo de espaço é `Θ(V + E)`. A matriz custa `Θ(V²)` e só compensa em grafos densos, quando `E` se aproxima de `V²` e a checagem O(1) é usada o tempo todo.

BFS usa uma fila FIFO e um array de distâncias inicializado com -1. A origem entra com distância 0 e é marcada **ao enfileirar**, não ao desenfileirar. Cada vizinho não visitado recebe `dist[u] + 1`. Como a fila processa todos os vértices a distância `d` antes dos de `d + 1`, a primeira visita é a menor distância. Para contar componentes, envolva a BFS em um laço sobre todos os vértices: cada vez que encontrar distância -1, incremente o contador e inicie uma BFS.

```java
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class GrafoBfs {

    private final List<Integer>[] adj;

    @SuppressWarnings("unchecked")
    public GrafoBfs(int vertices) {
        adj = new List[vertices];
        for (int i = 0; i < vertices; i++) adj[i] = new ArrayList<>();
    }

    public void aresta(int u, int v) {
        adj[u].add(v);
        adj[v].add(u); // não direcionado: aresta nos dois sentidos
    }

    private void bfs(int origem, int[] dist) {
        ArrayDeque<Integer> fila = new ArrayDeque<>();
        dist[origem] = 0;
        fila.add(origem); // marca ao enfileirar, não ao desenfileirar
        while (!fila.isEmpty()) {
            int u = fila.poll();
            for (int v : adj[u]) {
                if (dist[v] == -1) {
                    dist[v] = dist[u] + 1;
                    fila.add(v);
                }
            }
        }
    }

    public int[] distancias(int origem) {
        int[] dist = new int[adj.length];
        Arrays.fill(dist, -1);
        bfs(origem, dist);
        return dist;
    }

    public int componentes() {
        int[] dist = new int[adj.length];
        Arrays.fill(dist, -1);
        int total = 0;
        for (int i = 0; i < adj.length; i++) {
            if (dist[i] == -1) { // só inicia se ainda não foi alcançado
                total++;
                bfs(i, dist);
            }
        }
        return total;
    }
}
```

DFS explora fundo antes de voltar. Com três cores, você distingue o que ainda está na pilha de recursão do que já terminou: branco = não visitado, cinza = em processamento, preto = concluído. Em grafo direcionado, uma aresta para um vértice cinza fecha um ciclo, porque ele é ancestral na pilha atual. Uma aresta para preto é apenas cruzamento ou avanço, não ciclo.

```java
import java.util.ArrayList;
import java.util.List;

public class GrafoDfs {

    private final List<Integer>[] adj;

    @SuppressWarnings("unchecked")
    public GrafoDfs(int vertices) {
        adj = new List[vertices];
        for (int i = 0; i < vertices; i++) adj[i] = new ArrayList<>();
    }

    public void aresta(int u, int v) {
        adj[u].add(v); // direcionado
    }

    public boolean temCiclo() {
        int[] cor = new int[adj.length]; // 0=branco, 1=cinza, 2=preto
        for (int i = 0; i < adj.length; i++) {
            if (cor[i] == 0 && dfs(i, cor)) return true;
        }
        return false;
    }

    private boolean dfs(int u, int[] cor) {
        cor[u] = 1;
        for (int v : adj[u]) {
            if (cor[v] == 1) return true; // aresta de volta: ciclo
            if (cor[v] == 0 && dfs(v, cor)) return true;
        }
        cor[u] = 2;
        return false;
    }
}
```

## Na prática

Em produção, o gargalo raramente é o percurso e quase sempre é a memória. Uma lista de `List<Integer>[]` guarda referências e objetos `Integer`, com overhead de 16–20 bytes por aresta; para 100 milhões de arestas, isso inviabiliza. Grafos grandes usam arrays compactos no formato CSR (compressed sparse row): um array de offsets e um array de destinos, sem objetos. BFS também precisa de fronteira: em um grafo com milhões de vértices, a fila pode ocupar mais memória que o próprio grafo.

A escolha BFS versus DFS segue a pergunta. Distância mínima sem pesos, menor número de passos, nível de propagação: BFS. Componentes, ordenação topológica, pontes e articulações: DFS. Se o grafo é ponderado, BFS não serve — ela minimiza arestas, não soma de pesos. E se a profundidade pode chegar a 100 mil, DFS recursivo estoura a stack; a versão iterativa mantém a pilha no heap.

## Armadilhas comuns

- **Marcar visitado ao desenfileirar.** O mesmo vértice entra várias vezes e a fila pode explodir; marque ao enfileirar.
- **Contar componente sem o teste `dist[i] == -1`.** O laço externo inicia uma BFS por vértice e conta o mesmo componente várias vezes.
- **Rodar DFS recursivo em grafo profundo.** Um caminho de 100 mil vértices gera 100 mil frames e `StackOverflowError`.
- **Detectar ciclo em grafo não direcionado sem o pai.** A aresta de volta para o pai parece ciclo; carregue o vértice anterior ou remova a aresta ao descer.
- **Usar matriz para grafo esparso.** `int[100_000][100_000]` são 40 GB; a lista usa O(V + E).

## Para ir além

- [cp-algorithms — BFS](https://cp-algorithms.com/graph/breadth-first-search.html): prova da distância mínima e variantes.
- [cp-algorithms — DFS](https://cp-algorithms.com/graph/depth-first-search.html): cores, classificação de arestas e aplicações.
- [Visualgo — DFS/BFS](https://visualgo.net/en/dfsbfs): compare as duas ordens de exploração.
