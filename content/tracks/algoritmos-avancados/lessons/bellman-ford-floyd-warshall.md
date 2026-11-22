> **Em uma frase:** Bellman-Ford paga O(VE) para tolerar pesos negativos e detectar ciclos; Floyd-Warshall paga O(V³) para responder todos os pares — escolha pelo grafo, não pelo nome.

Dijkstra é rápido, mas quebra com arestas negativas. Bellman-Ford relaxa todas as arestas V-1 vezes e detecta ciclo negativo na última passada. Floyd-Warshall calcula distâncias entre todos os pares com programação dinâmica.

## O problema

Um grafo de arbitragem tem taxas de câmbio e você quer detectar lucro garantido. Um mapa tem estradas com bônus (peso negativo) e você quer o menor custo. Um sistema pequeno precisa de distância entre todas as cidades. Cada cenário pede um algoritmo diferente.

## Como funciona

**Bellman-Ford:**

```java
static long[] bellmanFord(int n, List<int[]> arestas, int origem) {
    long[] dist = new long[n];
    Arrays.fill(dist, Long.MAX_VALUE / 2);
    dist[origem] = 0;

    for (int i = 0; i < n - 1; i++) {
        for (var a : arestas) { // {u, v, w}
            int u = a[0], v = a[1], w = a[2];
            if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
        }
    }
    for (var a : arestas) {
        if (dist[a[0]] + a[2] < dist[a[1]]) {
            throw new IllegalStateException("ciclo negativo alcançável");
        }
    }
    return dist;
}
```

**Floyd-Warshall:**

```java
static long[][] floyd(long[][] d) {
    int n = d.length;
    for (int k = 0; k < n; k++)
        for (int i = 0; i < n; i++)
            for (int j = 0; j < n; j++)
                if (d[i][k] + d[k][j] < d[i][j])
                    d[i][j] = d[i][k] + d[k][j];
    return d;
}
```

Use `long` e infinito seguro para evitar overflow. Para reconstruir caminho, guarde `next[i][j]`.

## Na prática

Bellman-Ford com fila (SPFA) melhora o caso médio, mas o pior caso continua O(VE). Para grafos grandes com pesos negativos, considere Johnson (reweighting + Dijkstra).

Floyd-Warshall brilha com V <= 500 e muitas consultas. Para V grande, all-pairs é inviável; use Dijkstra por origem ou algoritmos especializados.

Detecção de ciclo negativo: após V-1 relaxamentos, qualquer aresta que ainda melhora indica ciclo. Para arbitragem, use `-log(taxa)` e detecte ciclo negativo.

## Armadilhas comuns

- Bellman-Ford com V passadas e detecção no lugar errado.
- Overflow em `Integer.MAX_VALUE`.
- Floyd com `k` no loop interno (ordem errada).
- Dijkstra em grafo com peso negativo.
- Confundir ciclo negativo alcançável com qualquer ciclo.

## Para ir além

Leia os capítulos de Bellman-Ford e Floyd-Warshall em cp-algorithms.com. Depois detecte arbitragem em um grafo de câmbio.
