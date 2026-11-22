> **Em uma frase:** LIS, interval DP e stock problems parecem três assuntos, mas todos pedem a mesma disciplina: definir o estado, achar a ordem de dependência e só então otimizar.

## O problema

Três famílias de problemas dominam as entrevistas de DP de nível médio para difícil. A primeira pede a maior subsequência crescente — e a solução O(n²) não passa quando n = 10^5. A segunda pede decisões em intervalos, como estourar balões ou multiplicar matrizes, e a ordem de iteração não é óbvia. A terceira modela compra e venda de ações com restrições de cooldown, taxa ou número de transações.

Todas têm recorrências curtas e implementações traiçoeiras. O objetivo aqui não é decorar três códigos, e sim reconhecer a estrutura de estado que cada uma usa.

## Como funciona

**LIS em O(n log n).** A DP quadrática define `dp[i]` como o comprimento da LIS terminando em `i`: `dp[i] = 1 + max(dp[j])` para `j < i` e `nums[j] < nums[i]`. Ela é fácil de entender, mas O(n²).

A versão rápida mantém um array `tails`, em que `tails[k]` é o **menor final possível** de uma subsequência crescente de comprimento `k+1`. Para cada número `x`, encontre o primeiro `tails[k] >= x` e substitua por `x`. Se `x` é maior que todos, acrescente no fim. O comprimento de `tails` é a resposta.

Por que funciona? Substituir um final maior por um menor nunca piora as extensões futuras: qualquer número que poderia continuar a sequência antiga também pode continuar a nova, e a nova deixa mais espaço. O array `tails` **não é** a LIS; é apenas o conjunto de melhores finais por comprimento. Essa distinção é a pergunta de acompanhamento favorita dos entrevistadores.

```java
public class LongestIncreasingSubsequence {

    public static int lengthOfLIS(int[] nums) {
        int[] tails = new int[nums.length];
        int size = 0;

        for (int x : nums) {
            // lower_bound: primeiro tails[mid] >= x
            int lo = 0;
            int hi = size;
            while (lo < hi) {
                int mid = lo + (hi - lo) / 2;
                if (tails[mid] < x) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }
            tails[lo] = x;
            if (lo == size) {
                size++;
            }
        }
        return size;
    }
}
```

Para LIS estritamente crescente, use o primeiro `>= x`. Para LIS não decrescente, use o primeiro `> x`; trocar essa comparação é o erro mais comum.

**Interval DP.** O estado é `dp[i][j]`: o melhor resultado para o intervalo `[i, j]`. A recorrência escolhe um ponto `k` para dividir o intervalo e combina os lados. Em Burst Balloons, `k` é o **último** balão estourado no intervalo; os vizinhos dele são `i-1` e `j+1`, que ainda estão de pé. A recorrência é:

`dp[i][j] = max(dp[i][k-1] + a[i-1] * a[k] * a[j+1] + dp[k+1][j])`.

A ordem de iteração é por **comprimento do intervalo**, porque `dp[i][j]` depende de intervalos menores. Se você iterar por `i` e depois `j`, os subintervalos podem não estar prontos.

```java
public class BurstBalloons {

    public static int maxCoins(int[] nums) {
        int n = nums.length;
        int[] a = new int[n + 2];
        a[0] = 1;
        a[n + 1] = 1;
        for (int i = 0; i < n; i++) {
            a[i + 1] = nums[i];
        }

        int[][] dp = new int[n + 2][n + 2];
        for (int len = 1; len <= n; len++) {
            for (int i = 1; i + len - 1 <= n; i++) {
                int j = i + len - 1;
                for (int k = i; k <= j; k++) {
                    int coins = a[i - 1] * a[k] * a[j + 1];
                    dp[i][j] = Math.max(dp[i][j],
                            dp[i][k - 1] + coins + dp[k + 1][j]);
                }
            }
        }
        return dp[1][n];
    }
}
```

**Stock problems.** A família de "comprar e vender ações" é uma máquina de estados. Para o caso com cooldown de um dia, três estados bastam:

- `hold`: melhor lucro com uma ação em mãos.
- `sold`: melhor lucro no dia em que vendeu (não pode comprar amanhã).
- `rest`: melhor lucro sem ação e sem ter vendido hoje.

As transições são `hold = max(hold, rest - preço)`, `sold = hold_anterior + preço` e `rest = max(rest, sold_anterior)`. A ordem importa: use os valores anteriores antes de sobrescrever.

```java
public class StockWithCooldown {

    public static int maxProfit(int[] prices) {
        int hold = Integer.MIN_VALUE;
        int sold = 0;
        int rest = 0;

        for (int price : prices) {
            int previousHold = hold;
            int previousSold = sold;
            int previousRest = rest;

            hold = Math.max(previousHold, previousRest - price);
            sold = previousHold + price;
            rest = Math.max(previousRest, previousSold);
        }
        return Math.max(sold, rest);
    }
}
```

## Na prática

**LIS com reconstrução.** Guarde, para cada índice, o índice anterior que o estendeu (`parent[i]`). No fim, volte do índice que produziu o maior comprimento. Em entrevista, a reconstrução é um follow-up comum e testa se você entendeu que `tails` sozinho não guarda a sequência.

**Interval DP com matrizes.** Matrix Chain Multiplication usa a mesma ordem por comprimento, mas a recorrência é `dp[i][j] = min(dp[i][k] + dp[k+1][j] + custo)`. A escolha de `k` é o ponto de divisão, não o último elemento.

**Stock com k transações.** Adicione uma dimensão `dp[dia][transações][estado]`. Com `k` grande, a dimensão de transações é limitada por `n/2`; com taxa, subtraia a fee na venda. O estado é sempre "com ou sem ação", e as restrições viram transições.

## Armadilhas comuns

- **Achar que `tails` é a LIS.** Ele contém os menores finais por comprimento, não uma subsequência válida.
- **Usar `<=` em vez de `<` na busca da LIS.** Isso muda de estritamente crescente para não decrescente.
- **Iterar interval DP por índice crescente.** Sem a ordem por comprimento, você lê células ainda não calculadas.
- **Comprar no mesmo dia da venda com cooldown.** Use o estado `sold` separado e só permita comprar a partir de `rest`.
- **Esquecer o caso de um único elemento.** Em interval DP, as bordas `dp[i][i-1]` e `dp[j+1][j]` devem valer zero.

## Para ir além

- [CP-Algorithms — Longest Increasing Subsequence](https://cp-algorithms.com/sequences/longest_increasing_subsequence.html)
- [LeetCode 300 — Longest Increasing Subsequence](https://leetcode.com/problems/longest-increasing-subsequence/)
- [LeetCode 312 — Burst Balloons](https://leetcode.com/problems/burst-balloons/)
- [LeetCode 309 — Best Time to Buy and Sell Stock with Cooldown](https://leetcode.com/problems/best-time-to-buy-and-sell-stock-with-cooldown/)
