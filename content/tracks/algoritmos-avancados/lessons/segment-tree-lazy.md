> **Em uma frase:** segment tree com lazy resolve range query e range update em O(log n) — desde que você nunca esqueça de propagar antes de descer.

Um array precisa responder soma/mínimo em um intervalo e aplicar atualizações em massa. Atualizar elemento por elemento custa O(n). A segment tree guarda agregados por nó; o lazy adia a atualização dos filhos até que sejam visitados.

## O problema

Um sistema de reservas tem milhares de quartos e aplica reajuste em faixas de datas. Consultar o total de um período e atualizar um intervalo precisam ser rápidos. Fenwick resolve soma com ponto, mas não range update + range query arbitrário. Segment tree com lazy cobre os dois.

## Como funciona

Cada nó representa um intervalo e guarda o agregado. `lazy[node]` guarda uma atualização pendente para os filhos.

```java
class SegTree {
    private final long[] tree, lazy;
    private final int n;

    SegTree(long[] a) {
        n = a.length;
        tree = new long[4 * n];
        lazy = new long[4 * n];
        build(1, 0, n - 1, a);
    }

    void build(int node, int l, int r, long[] a) {
        if (l == r) { tree[node] = a[l]; return; }
        int m = (l + r) / 2;
        build(2 * node, l, m, a);
        build(2 * node + 1, m + 1, r, a);
        tree[node] = tree[2 * node] + tree[2 * node + 1];
    }

    void apply(int node, int l, int r, long val) {
        tree[node] += val * (r - l + 1);
        lazy[node] += val;
    }

    void push(int node, int l, int r) {
        if (lazy[node] == 0) return;
        int m = (l + r) / 2;
        apply(2 * node, l, m, lazy[node]);
        apply(2 * node + 1, m + 1, r, lazy[node]);
        lazy[node] = 0;
    }

    void update(int node, int l, int r, int ql, int qr, long val) {
        if (qr < l || r < ql) return;
        if (ql <= l && r <= qr) { apply(node, l, r, val); return; }
        push(node, l, r);
        int m = (l + r) / 2;
        update(2 * node, l, m, ql, qr, val);
        update(2 * node + 1, m + 1, r, ql, qr, val);
        tree[node] = tree[2 * node] + tree[2 * node + 1];
    }

    long query(int node, int l, int r, int ql, int qr) {
        if (qr < l || r < ql) return 0;
        if (ql <= l && r <= qr) return tree[node];
        push(node, l, r);
        int m = (l + r) / 2;
        return query(2 * node, l, m, ql, qr)
             + query(2 * node + 1, m + 1, r, ql, qr);
    }
}
```

## Na prática

Para mínimo/máximo, o lazy de atribuição é mais complexo que o de soma: precisa de `set` e `add` separados. Para soma, `apply` multiplica pelo tamanho do intervalo.

Use arrays de tamanho `4n`; para `n` até 10^6, memória de ~64 MB por árvore de `long`. Considere iterative segment tree para queries sem update.

## Armadilhas comuns

- Esquecer `push` antes de descer.
- `apply` sem multiplicar pelo tamanho.
- Índices fora do intervalo base.
- `lazy` não inicializado.
- Recursão profunda demais.

## Para ir além

Leia o capítulo de segment tree em cp-algorithms.com. Depois implemente range add + range sum e compare com força bruta.
