> **Em uma frase:** Fenwick é a segment tree magra para soma de prefixo; sparse table é a resposta O(1) para RMQ estático — escolha pelo que muda.

Fenwick (BIT) mantém prefix sums com update O(log n) e consulta O(log n), usando menos memória que uma segment tree. Sparse table responde mínimo/máximo em intervalo em O(1), mas não aceita updates.

## O problema

Você tem um array de vendas e precisa da soma dos primeiros k dias, com atualizações frequentes. Ou tem um array estático de alturas e milhares de consultas de mínimo em intervalos. Segment tree resolve os dois, mas com mais código e memória.

## Como funciona

**Fenwick:** `tree[i]` guarda a soma de um intervalo cujo tamanho é `i & -i`. Update sobe; query desce.

```java
class Fenwick {
    private final long[] tree;
    Fenwick(int n) { tree = new long[n + 1]; }

    void add(int i, long delta) { // i é 1-based
        for (; i < tree.length; i += i & -i) tree[i] += delta;
    }

    long prefix(int i) {
        long soma = 0;
        for (; i > 0; i -= i & -i) soma += tree[i];
        return soma;
    }

    long range(int l, int r) { return prefix(r) - prefix(l - 1); }
}
```

**Sparse table:** `st[k][i]` guarda o agregado de `2^k` elementos. Para RMQ, combine dois blocos que cobrem o intervalo.

```java
class SparseTable {
    private final int[][] st;
    private final int[] log;

    SparseTable(int[] a) {
        int n = a.length, k = 32 - Integer.numberOfLeadingZeros(n);
        st = new int[k][n];
        log = new int[n + 1];
        for (int i = 2; i <= n; i++) log[i] = log[i / 2] + 1;
        System.arraycopy(a, 0, st[0], 0, n);
        for (int j = 1; j < k; j++)
            for (int i = 0; i + (1 << j) <= n; i++)
                st[j][i] = Math.min(st[j - 1][i],
                    st[j - 1][i + (1 << (j - 1))]);
    }

    int min(int l, int r) {
        int j = log[r - l + 1];
        return Math.min(st[j][l], st[j][r - (1 << j) + 1]);
    }
}
```

## Na prática

Fenwick para soma de prefixo, contagem de inversões, 2D com BIT de BITs e diferença de arrays. Para range update + range query, use dois BITs.

Sparse table para RMQ, GCD e qualquer operação idempotente e associativa. Memória O(n log n). Para updates, use segment tree.

## Armadilhas comuns

- Índice 0 no Fenwick (é 1-based).
- `i & -i` com inteiro negativo mal compreendido.
- Sparse table com `log` errado.
- Usar sparse table com operação não idempotente.
- Esquecer que Fenwick não responde mínimo com update simples.

## Para ir além

Leia os capítulos de Fenwick e sparse table em cp-algorithms.com. Depois conte inversões com Fenwick e compare com merge sort.
