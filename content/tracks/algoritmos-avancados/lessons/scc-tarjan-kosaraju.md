> **Em uma frase:** SCC encontra grupos que se alcançam mutuamente; Tarjan faz em uma passada, Kosaraju em duas — ambos O(V+E).

Em um grafo dirigido, componentes fortemente conexos são ilhas onde todo nó alcança todo nó. Condensar o grafo em SCCs transforma ciclos em DAG, permitindo ordenação topológica, análise de dependências e detecção de recursão.

## O problema

Um grafo de dependências tem ciclos: A depende de B, B de C, C de A. Você quer identificar o grupo problemático, não apenas dizer "há ciclo". Ou quer reduzir o grafo para processar em ordem. SCC responde quais nós formam cada ciclo maximal.

## Como funciona

**Kosaraju:** DFS no grafo original para ordem de término; transponha; DFS na ordem inversa no transposto. Cada árvore é um SCC.

```java
static List<List<Integer>> kosaraju(int n, List<List<Integer>> adj) {
    boolean[] visto = new boolean[n];
    var ordem = new ArrayDeque<Integer>();
    for (int i = 0; i < n; i++) if (!visto[i]) dfs1(i, adj, visto, ordem);

    var rev = new ArrayList<List<Integer>>();
    for (int i = 0; i < n; i++) rev.add(new ArrayList<>());
    for (int u = 0; u < n; u++) for (int v : adj.get(u)) rev.get(v).add(u);

    Arrays.fill(visto, false);
    var sccs = new ArrayList<List<Integer>>();
    while (!ordem.isEmpty()) {
        int u = ordem.pop();
        if (!visto[u]) {
            var comp = new ArrayList<Integer>();
            dfs2(u, rev, visto, comp);
            sccs.add(comp);
        }
    }
    return sccs;
}
```

**Tarjan:** uma DFS com `disc`, `low` e pilha. Quando `low[u] == disc[u]`, desempilhe até `u`.

```java
static void tarjan(int u, List<List<Integer>> adj, int[] disc, int[] low,
                   boolean[] naPilha, Deque<Integer> pilha, int[] tempo,
                   List<List<Integer>> sccs) {
    disc[u] = low[u] = ++tempo[0];
    pilha.push(u);
    naPilha[u] = true;
    for (int v : adj.get(u)) {
        if (disc[v] == 0) {
            tarjan(v, adj, disc, low, naPilha, pilha, tempo, sccs);
            low[u] = Math.min(low[u], low[v]);
        } else if (naPilha[v]) {
            low[u] = Math.min(low[u], disc[v]);
        }
    }
    if (low[u] == disc[u]) {
        var comp = new ArrayList<Integer>();
        int w;
        do {
            w = pilha.pop();
            naPilha[w] = false;
            comp.add(w);
        } while (w != u);
        sccs.add(comp);
    }
}
```

## Na prática

Kosaraju é mais fácil de explicar e implementar; Tarjan usa menos memória e uma passada. Para grafos enormes, Tarjan iterativo evita stack overflow.

Aplique SCC em: detecção de ciclo em dependências, análise de deadlock, condensação para DAG, e 2-SAT. Depois de condensar, uma ordenação topológica dá a ordem de processamento dos grupos.

## Armadilhas comuns

- Recursão profunda estourando a pilha.
- Esquecer `naPilha` no Tarjan.
- Confundir SCC com componente conexo (não dirigido).
- Kosaraju sem transpor corretamente.
- Ordem de término errada.

## Checklist de domínio

- [ ] Implemento Kosaraju e Tarjan.
- [ ] Explico `disc`/`low`.
- [ ] Condenso o grafo em DAG.
- [ ] Sei a complexidade e o custo de memória.
- [ ] Evito stack overflow.

## Para ir além

Leia o capítulo de SCC em cp-algorithms.com. Depois encontre os SCCs de um grafo de dependências real e ordene os grupos.
