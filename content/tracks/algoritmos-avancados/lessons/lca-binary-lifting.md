> **Em uma frase:** guardando o ancestral `2^k` de cada nó, você sobe qualquer distância em O(log n) — e o menor ancestral comum (LCA) vira "igualar profundidades e subir os dois juntos".

## O problema

"Dado um organograma com 10^5 pessoas e 10^5 perguntas do tipo 'quem é o gestor comum mais próximo de A e B?', responda todas." A pergunta isolada é o LeetCode 236 (Lowest Common Ancestor of a Binary Tree), resolvido com uma DFS O(n). Com 10^5 perguntas, isso vira 10^10 operações. O follow-up é exatamente esse: "e se forem muitas consultas?".

Outro disfarce é o LeetCode 1483 (Kth Ancestor of a Tree Node): "qual é o ancestral `k` níveis acima de `x`?", com até 5·10^4 consultas. Subir um pai por vez custa O(k) por consulta — com uma árvore em linha reta, O(n) cada.

Os dois se resolvem com a mesma técnica: **binary lifting**.

## Como funciona

### A tabela de saltos

Para cada nó `v`, guarde `up[k][v]` = o ancestral `2^k` níveis acima de `v` (ou `-1` se não existir). A tabela se preenche com uma recorrência simples: subir `2^k` é subir `2^(k-1)` duas vezes.

```
up[0][v] = pai(v)
up[k][v] = up[k-1][ up[k-1][v] ]
```

São `LOG = ⌈log2 n⌉ + 1` níveis; para `n = 10^5`, `LOG = 17`. Pré-processamento O(n log n) de tempo e memória.

### Subir k níveis

Escreva `k` em binário e salte pelas potências correspondentes: para `k = 13 = 1101₂`, salte 8, 4 e 1. Cada consulta custa O(log n).

### LCA em dois passos

1. **Iguale as profundidades.** Suba o nó mais fundo `prof(u) - prof(v)` níveis.
2. **Suba os dois juntos.** Para `k` do maior para o menor: se `up[k][u] != up[k][v]`, salte os dois. Ao final, eles são filhos distintos do LCA; a resposta é `up[0][u]`.

O segundo passo é uma busca binária pela altura do ancestral comum: os saltos que mantêm os nós diferentes são seguros; os que os juntariam podem ter passado do LCA.

```java
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

public final class BinaryLifting {
    private final int log;
    private final int[][] up;
    private final int[] profundidade;

    // pais[v] = pai de v; a raiz tem pai -1. Os nós são 0..n-1.
    BinaryLifting(int[] pais) {
        int n = pais.length;
        int l = 1;
        while ((1 << l) < n) l++;
        log = l + 1;
        up = new int[log][n];
        profundidade = new int[n];

        List<List<Integer>> filhos = new ArrayList<>();
        for (int i = 0; i < n; i++) filhos.add(new ArrayList<>());
        int raiz = -1;
        for (int v = 0; v < n; v++) {
            up[0][v] = pais[v];
            if (pais[v] == -1) raiz = v;
            else filhos.get(pais[v]).add(v);
        }

        // BFS iterativa para as profundidades: sem risco de StackOverflowError.
        ArrayDeque<Integer> fila = new ArrayDeque<>();
        fila.add(raiz);
        while (!fila.isEmpty()) {
            int v = fila.poll();
            for (int f : filhos.get(v)) {
                profundidade[f] = profundidade[v] + 1;
                fila.add(f);
            }
        }

        for (int k = 1; k < log; k++) {
            for (int v = 0; v < n; v++) {
                int meio = up[k - 1][v];
                up[k][v] = meio == -1 ? -1 : up[k - 1][meio];
            }
        }
    }

    // LeetCode 1483: ancestral k níveis acima, ou -1.
    int ancestral(int v, int k) {
        for (int bit = 0; bit < log && v != -1; bit++) {
            if ((k >> bit & 1) == 1) v = up[bit][v];
        }
        return k >= (1 << log) ? -1 : v;
    }

    int lca(int u, int v) {
        if (profundidade[u] < profundidade[v]) { int t = u; u = v; v = t; }
        u = ancestral(u, profundidade[u] - profundidade[v]);
        if (u == v) return u;
        for (int k = log - 1; k >= 0; k--) {
            if (up[k][u] != up[k][v]) {
                u = up[k][u];
                v = up[k][v];
            }
        }
        return up[0][u];
    }

    int distancia(int u, int v) {
        return profundidade[u] + profundidade[v] - 2 * profundidade[lca(u, v)];
    }

    public static void main(String[] args) {
        //        0
        //      /   \
        //     1     2
        //    / \     \
        //   3   4     5
        //       |
        //       6
        int[] pais = {-1, 0, 0, 1, 1, 2, 4};
        BinaryLifting bl = new BinaryLifting(pais);
        System.out.println(bl.lca(3, 6));       // 1
        System.out.println(bl.lca(6, 5));       // 0
        System.out.println(bl.ancestral(6, 2)); // 1
        System.out.println(bl.distancia(3, 5)); // 4
    }
}
```

### Comparando as abordagens

| Abordagem | Pré-processamento | Por consulta | Quando usar |
|---|---|---|---|
| DFS por consulta (LC 236) | nenhum | O(n) | uma consulta só |
| Subir pai a pai | O(n) | O(profundidade) | árvore rasa e balanceada |
| Binary lifting | O(n log n) | O(log n) | muitas consultas, k-ésimo ancestral |
| Euler tour + sparse table | O(n log n) | O(1) | só LCA, consultas massivas |

A última linha liga esta aula à de Fenwick e sparse table: na sequência da DFS (Euler tour), o LCA de `u` e `v` é o nó de menor profundidade entre as aparições de `u` e `v` — um mínimo em intervalo estático, que a sparse table responde em O(1). Binary lifting é mais versátil (responde k-ésimo ancestral e agrega valores no caminho, como o máximo peso de aresta); Euler tour é mais rápido para LCA puro.

## Na prática

Em entrevista, a sequência que funciona é: resolva o LC 236 com a DFS recursiva clássica, mencione que ela é O(n) por consulta e, quando vier o follow-up de muitas consultas, apresente binary lifting. Explicar a ideia ("a tabela guarda saltos em potências de dois, e qualquer distância é soma de potências de dois") vale mais do que o código perfeito.

Fora do quadro branco, o mesmo padrão aparece em sistemas reais: encontrar o commit ancestral comum de dois branches (`git merge-base`) é um LCA num grafo de commits; hierarquias organizacionais, árvores de categorias de e-commerce e árvores de DOM respondem "qual é o contêiner comum" com essa técnica ou variantes dela.

## Armadilhas comuns

- **`LOG` pequeno demais.** Com `LOG = log2(n)` arredondado para baixo, a árvore em linha reta com `n` nós precisa de um salto que não existe. Use `⌈log2 n⌉ + 1`.
- **DFS recursiva em árvore degenerada.** Uma linha de 10^5 nós estoura a pilha da JVM. Calcule as profundidades com BFS ou pilha explícita, como no código.
- **Esquecer o caso `u == v` após igualar.** Se um nó é ancestral do outro, a resposta é ele mesmo; sem o `if`, o laço devolve o pai dele.
- **Propagar `-1` sem checar.** `up[k-1][-1]` lança `ArrayIndexOutOfBoundsException`. Trate a ausência de ancestral explicitamente.

## Para ir além

- [Lowest Common Ancestor — Binary Lifting (cp-algorithms)](https://cp-algorithms.com/graph/lca_binary_lifting.html)
- [LCA com Euler tour e RMQ (cp-algorithms)](https://cp-algorithms.com/graph/lca.html)
- [LeetCode 236 — Lowest Common Ancestor of a Binary Tree](https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/)
- [LeetCode 1483 — Kth Ancestor of a Tree Node](https://leetcode.com/problems/kth-ancestor-of-a-tree-node/)
