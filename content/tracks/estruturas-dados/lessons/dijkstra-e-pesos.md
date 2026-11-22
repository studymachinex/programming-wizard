> **Em uma frase:** Dijkstra responde "qual o caminho mais barato?" quando os pesos não são negativos — e a fila de prioridade é o que transforma O(V²) em O((V+E) log V).

De GPS a roteamento de pacotes, de custo de voo a latência entre serviços, o problema é o mesmo: menor custo acumulado de uma origem até todos os nós. A restrição de pesos não negativos não é detalhe: é o que garante que, ao retirar um nó da fila, seu custo é final.

## O problema

Um grafo tem cidades e estradas com custos positivos. BFS só funciona com pesos iguais. Bellman-Ford funciona com negativos, mas é mais lento. Dijkstra é o equilíbrio: simples, rápido e correto quando não há aresta negativa.

## Como funciona

Mantenha `dist[]` com infinito, `dist[origem]=0` e uma `PriorityQueue` de `(custo, nó)`. Retire o menor; se o custo for maior que o registrado, ignore (entrada obsoleta). Relaxe cada aresta: se `dist[u] + w < dist[v]`, atualize e enfileire.

```java
record Aresta(int para, int peso) {}

static int[] dijkstra(int n, List<List<Aresta>> adj, int origem) {
    int[] dist = new int[n];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[origem] = 0;

    var fila = new PriorityQueue<int[]>(Comparator.comparingInt(a -> a[0]));
    fila.add(new int[]{0, origem});

    while (!fila.isEmpty()) {
        var atual = fila.poll();
        int d = atual[0], u = atual[1];
        if (d > dist[u]) continue;           // obsoleto
        for (var e : adj.get(u)) {
            int nd = d + e.peso();
            if (nd < dist[e.para()]) {
                dist[e.para()] = nd;
                fila.add(new int[]{nd, e.para()});
            }
        }
    }
    return dist;
}
```

Complexidade: O((V+E) log V) com heap binário. Cada aresta pode gerar uma entrada; a memória da fila é O(E) no pior caso.

## Na prática

Para reconstruir o caminho, guarde `prev[v] = u` ao relaxar e suba até a origem. Para pesos pequenos e inteiros, Dial's algorithm ou radix heap reduzem o log. Para grafos densos, a versão O(V²) sem heap pode vencer.

Cuidado com overflow: use `long` se a soma de pesos passar de `Integer.MAX_VALUE`. Verifique alcançabilidade (`dist == INF`).

Em sistemas reais, latência muda o tempo todo. Dijkstra estático não resolve roteamento dinâmico; considere A*, contração de hierarquias ou algoritmos incrementais.

## Armadilhas comuns

- Usar Dijkstra com peso negativo: o resultado é silenciosamente errado.
- Não descartar entradas obsoletas da fila.
- Esquecer de inicializar `dist` com infinito.
- Overflow em `d + peso`.
- Confundir "menor número de arestas" com "menor custo".

## Para ir além

Leia o capítulo de Dijkstra em cp-algorithms.com e compare com Bellman-Ford. Depois resolva Network Delay Time no LeetCode com a implementação acima.
