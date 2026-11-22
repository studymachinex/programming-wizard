> **Em uma frase:** union-find responde "esses dois estão no mesmo grupo?" em tempo quase constante — e Kruskal o usa para construir a árvore geradora mínima.

Detecção de ciclos, componentes conexos, agrupamento de contas e rede de contatos compartilham uma estrutura surpreendentemente simples: cada elemento aponta para um pai; a raiz identifica o conjunto. Com path compression e union by rank, o custo amortizado é O(α(n)), praticamente O(1).

## O problema

Você tem milhões de arestas e quer saber se adicionar uma cria ciclo, ou quantos grupos desconexos existem. BFS/DFS por aresta custa O(V+E) a cada consulta. Union-find mantém a resposta incrementalmente.

## Como funciona

```java
class UnionFind {
    private final int[] pai, rank;

    UnionFind(int n) {
        pai = new int[n];
        rank = new int[n];
        for (int i = 0; i < n; i++) pai[i] = i;
    }

    int find(int x) {
        if (pai[x] != x) pai[x] = find(pai[x]); // path compression
        return pai[x];
    }

    boolean union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return false;             // já conectados: ciclo
        if (rank[ra] < rank[rb]) { int t = ra; ra = rb; rb = t; }
        pai[rb] = ra;
        if (rank[ra] == rank[rb]) rank[ra]++;
        return true;
    }
}
```

Kruskal: ordene as arestas por peso e adicione as que unem conjuntos diferentes. O resultado é a MST.

```java
static long kruskal(int n, List<int[]> arestas) { // {peso, u, v}
    arestas.sort(Comparator.comparingInt(a -> a[0]));
    var uf = new UnionFind(n);
    long custo = 0;
    int usadas = 0;
    for (var a : arestas) {
        if (uf.union(a[1], a[2])) {
            custo += a[0];
            if (++usadas == n - 1) break;
        }
    }
    return usadas == n - 1 ? custo : -1; // -1 = desconexo
}
```

## Na prática

Union-find brilha em processamento de imagens (componentes), detecção de ciclo em grafo não dirigido, contas duplicadas e jogos de conexão. Para grafos dirigidos, use SCC (Tarjan/Kosaraju), não union-find.

Path compression sozinho já dá O(log n) amortizado; com union by rank, chega a α(n). A recursão do `find` pode ser profunda antes da compressão; em casos extremos, use versão iterativa.

## Armadilhas comuns

- `union` sem comparar raízes (une nós em vez de conjuntos).
- Esquecer path compression e degradar para lista.
- Usar union-find em grafo dirigido.
- Assumir que a MST é única quando há pesos iguais.
- Não verificar se o grafo é conexo ao final.

## Para ir além

Leia o capítulo de disjoint set union em cp-algorithms.com. Depois implemente Kruskal e compare o custo com Prim em um grafo denso.
