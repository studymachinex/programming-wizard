> **Em uma frase:** max-flow e min-cut são o mesmo problema visto de dois lados — e o teorema de Ford-Fulkerson transforma capacidade em gargalo.

Fluxo máximo responde quanto se pode enviar de uma fonte a um sumidouro respeitando capacidades. Min-cut responde qual conjunto de arestas, se removido, desconecta os dois. O valor máximo é igual à capacidade do corte mínimo.

## O problema

Uma rede de tubos, uma malha de entrega, tarefas para máquinas, matching bipartido: todos são fluxo. Um algoritmo guloso falha porque precisa desfazer decisões. O caminho aumentante resolve isso com a aresta reversa.

## Como funciona

**Edmonds-Karp:** BFS para achar caminho aumentante; repita até não existir. O(V·E²).

```java
static int maxFlow(int[][] cap, int s, int t) {
    int n = cap.length, fluxo = 0;
    int[] pai = new int[n];
    while (true) {
        Arrays.fill(pai, -1);
        pai[s] = s;
        var fila = new ArrayDeque<Integer>();
        fila.add(s);
        while (!fila.isEmpty() && pai[t] == -1) {
            int u = fila.poll();
            for (int v = 0; v < n; v++) {
                if (pai[v] == -1 && cap[u][v] > 0) {
                    pai[v] = u;
                    fila.add(v);
                }
            }
        }
        if (pai[t] == -1) break;

        int gargalo = Integer.MAX_VALUE;
        for (int v = t; v != s; v = pai[v]) {
            gargalo = Math.min(gargalo, cap[pai[v]][v]);
        }
        for (int v = t; v != s; v = pai[v]) {
            cap[pai[v]][v] -= gargalo;
            cap[v][pai[v]] += gargalo; // reversa
        }
        fluxo += gargalo;
    }
    return fluxo;
}
```

**Dinic:** BFS de níveis + DFS de blocking flow. O(V²E), muito mais rápido na prática.

**Min-cut:** após o fluxo máximo, faça BFS/DFS a partir de `s` no grafo residual. Arestas que cruzam de alcançável para não alcançável formam o corte.

## Na prática

Modele matching bipartido como fluxo: fonte -> lado A (cap 1), arestas de compatibilidade (cap 1), lado B -> sumidouro (cap 1). O fluxo máximo é o matching máximo.

Cuidado com capacidades grandes e múltiplas arestas. Para grafos densos, matriz; para esparsos, listas de adjacência com arestas reversas indexadas.

## Armadilhas comuns

- Esquecer a aresta reversa e travar em decisões gulosas.
- BFS sem checar capacidade residual.
- Confundir corte mínimo com arestas de maior capacidade.
- Overflow ao somar fluxo.
- Usar Edmonds-Karp em grafo grande quando Dinic é necessário.

## Para ir além

Leia o capítulo de max-flow em cp-algorithms.com. Depois resolva um matching bipartido com fluxo e identifique o corte mínimo.
