> **Em uma frase:** binary search não é decorar um `while`; é manter um invariante explícito sobre onde a resposta pode estar — e o mesmo raciocínio resolve first/last, array rotacionado e espaço de respostas.

## O problema

Varrer um milhão de registros custa um milhão de comparações. Com busca binária, custa vinte. O pré-requisito é ordem: a cada passo você olha o meio e descarta metade dos candidatos. Binary search é fácil de escrever errado: off-by-one, overflow no meio, `hi` inclusivo misturado com exclusivo e laços infinitos.

As variantes cobrem o que produção pede: primeira e última ocorrência, array rotacionado e busca sobre o espaço de respostas — transformar "qual a menor capacidade que atende em h horas?" em um predicado monotônico.

## Como funciona

O template usa intervalo meio-aberto `[lo, hi)`, com `hi = a.length` e `while (lo < hi)`. O invariante: a resposta está em `[lo, hi]`; `lo` é o primeiro candidato e `hi` nunca é resposta. `mid = lo + (hi - lo) / 2` evita overflow. Se `a[mid] < alvo`, o meio e tudo à esquerda são pequenos demais, então `lo = mid + 1`; caso contrário, `hi = mid`. Ao terminar, `lo` é o primeiro índice com valor maior ou igual ao alvo — o **lower bound**. Trocar `<` por `<=` produz o **upper bound**, primeiro índice estritamente maior. Primeira e última saem de graça: `lowerBound(alvo)` e `upperBound(alvo) - 1`.

```java
public class BinarySearch {

    public static int lowerBound(int[] a, int alvo) {
        int lo = 0, hi = a.length; // resposta em [lo, hi)
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] < alvo) lo = mid + 1;
            else hi = mid;
        }
        return lo; // primeiro índice >= alvo, ou a.length
    }

    public static int upperBound(int[] a, int alvo) {
        int lo = 0, hi = a.length;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] <= alvo) lo = mid + 1;
            else hi = mid;
        }
        return lo; // primeiro índice > alvo
    }

    public static int[] primeiraUltima(int[] a, int alvo) {
        int ini = lowerBound(a, alvo);
        if (ini == a.length || a[ini] != alvo) return new int[]{-1, -1};
        return new int[]{ini, upperBound(a, alvo) - 1};
    }
}
```

No array rotacionado, pelo menos uma das metades está ordenada. Compare `a[lo]` com `a[mid]`: se `a[lo] <= a[mid]`, a esquerda está ordenada; verifique se o alvo cai nela e descarte a outra metade. Senão, espelhe para a direita. Com duplicatas, `a[lo] == a[mid] == a[hi]` não permite decidir o lado; encolha as duas pontas. O pior caso vira `O(n)`.

Binary search on answer exige um predicado monotônico: se uma capacidade `k` atende, toda capacidade maior também atende. Você busca o menor `k` viável em `[1, max]`, e cada teste custa `O(n)`.

```java
public class BinarySearchVariantes {

    public static int buscarRotacionado(int[] a, int alvo) {
        int lo = 0, hi = a.length - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] == alvo) return mid;
            if (a[lo] == a[mid] && a[mid] == a[hi]) { // duplicatas impedem decidir
                lo++;
                hi--;
            } else if (a[lo] <= a[mid]) { // metade esquerda ordenada
                if (a[lo] <= alvo && alvo < a[mid]) hi = mid - 1;
                else lo = mid + 1;
            } else { // metade direita ordenada
                if (a[mid] < alvo && alvo <= a[hi]) lo = mid + 1;
                else hi = mid - 1;
            }
        }
        return -1;
    }

    public static int velocidadeMinima(int[] pilhas, int horas) {
        int lo = 1, hi = 0;
        for (int p : pilhas) hi = Math.max(hi, p);
        while (lo < hi) { // menor k viável
            int mid = lo + (hi - lo) / 2;
            if (consegue(pilhas, horas, mid)) hi = mid;
            else lo = mid + 1;
        }
        return lo;
    }

    private static boolean consegue(int[] pilhas, int horas, int velocidade) {
        long total = 0;
        for (int p : pilhas) total += (p + velocidade - 1L) / velocidade;
        return total <= horas;
    }

}
```

## Na prática

Em produção, binary search acha limites: a primeira versão que quebrou, o menor timeout que passa no SLO, a menor instância que aguenta a carga. Todos são lower bound sobre um predicado. A JDK oferece `Arrays.binarySearch`, mas retorna um índice qualquer entre duplicados — para a primeira ocorrência, implemente o seu.

A busca clássica é `O(log n)` e não aloca. On answer, cada passo paga `O(n)` para avaliar a viabilidade, resultando em `O(n log M)`; se o predicado for caro, vale memoizar. Em arrays pequenos, a varredura linear vence por cache e branches previsíveis.

## Armadilhas comuns

- **Misturar `lo <= hi` com `hi = mid`.** O intervalo não encolhe e o laço fica infinito; escolha um template.
- **Calcular `(lo + hi) / 2`.** Para arrays próximos de 2³¹, a soma estoura e o índice fica negativo; use `lo + (hi - lo) / 2`.
- **Usar `hi = a.length` com `a[mid] <= alvo` e `lo <= hi`.** Você lê `a[a.length]`; o template meio-aberto exige `lo < hi`.
- **Rotacionado sem tratar duplicatas.** `[2, 2, 2, 0, 2]` não revela qual metade está ordenada sem encolher as pontas.
- **Predicado não monotônico no answer space.** Se viável em `k` não implica viável em `k+1`, a busca descarta a resposta.

## Checklist de domínio

- [ ] Você escreve lower/upper bound de memória e explica o invariante `[lo, hi)`
- [ ] Você extrai primeira e última ocorrência sem varrer o array
- [ ] Você resolve array rotacionado com e sem duplicatas
- [ ] Você reconhece um problema de "menor capacidade viável" e define o predicado

## Para ir além

- [cp-algorithms — Binary Search](https://cp-algorithms.com/num_methods/binary_search.html): variantes e provas.
- [LeetCode — Search in Rotated Sorted Array](https://leetcode.com/problems/search-in-rotated-sorted-array/): a versão com e sem duplicatas.
- [LeetCode — Koko Eating Bananas](https://leetcode.com/problems/koko-eating-bananas/): binary search on answer canônico.
