> **Em uma frase:** DP 2D é uma tabela em que cada célula responde a uma pergunta sobre dois prefixos ou duas capacidades; a recorrência é a história de como chegar ali.

## O problema

Problemas com duas dimensões — duas strings, dois índices, capacidade e item — não cabem em um único `dp[i]`. Você tenta adaptar a recorrência de 1D, mas a resposta depende de duas escolhas independentes: até onde foi na primeira string e até onde foi na segunda; quanto já se usou da capacidade e quais itens já foram considerados.

A boa notícia é que o método é o mesmo. A diferença é que agora você precisa definir **duas coordenadas** e decidir a ordem de preenchimento da tabela. Edit distance e knapsack são os dois representantes canônicos desse formato, e quase todo problema 2D é uma variação de um deles.

## Como funciona

**Edit distance.** Você quer o mínimo de operações (inserir, remover, substituir) para transformar `word1` em `word2`. Defina `dp[i][j]` como o custo mínimo para transformar o prefixo `word1[0..i)` no prefixo `word2[0..j)`.

A última decisão olha para os últimos caracteres:

- Se `word1[i-1] == word2[j-1]`, eles já combinam: `dp[i][j] = dp[i-1][j-1]`.
- Se não, você pode substituir (`dp[i-1][j-1] + 1`), remover de `word1` (`dp[i-1][j] + 1`) ou inserir em `word1` (`dp[i][j-1] + 1`). O mínimo entre as três é a resposta.

As bases são as bordas da tabela: transformar uma string vazia em um prefixo de tamanho `j` custa `j` inserções; transformar um prefixo de tamanho `i` em vazio custa `i` remoções. Por isso `dp[0][j] = j` e `dp[i][0] = i`.

```java
public class EditDistance {

    public static int minDistance(String word1, String word2) {
        int m = word1.length();
        int n = word2.length();
        int[][] dp = new int[m + 1][n + 1];

        for (int i = 0; i <= m; i++) {
            dp[i][0] = i; // remover todos os caracteres
        }
        for (int j = 0; j <= n; j++) {
            dp[0][j] = j; // inserir todos os caracteres
        }

        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    int substitute = dp[i - 1][j - 1] + 1;
                    int delete = dp[i - 1][j] + 1;
                    int insert = dp[i][j - 1] + 1;
                    dp[i][j] = Math.min(substitute, Math.min(delete, insert));
                }
            }
        }
        return dp[m][n];
    }

    public static void main(String[] args) {
        System.out.println(minDistance("horse", "ros")); // 3
        System.out.println(minDistance("intention", "execution")); // 5
    }
}
```

O tempo é O(m · n) e o espaço é O(m · n). Como cada linha depende apenas da anterior e da própria linha, você pode reduzir para O(n) guardando duas linhas — ou até uma, com cuidado para não sobrescrever `dp[j-1]` antes de usá-lo.

**Knapsack 0/1.** Você tem itens com peso e valor, uma mochila com capacidade `C`, e cada item pode ser usado no máximo uma vez. Defina `dp[i][c]` como o valor máximo usando os primeiros `i` itens com capacidade `c`. A decisão no item `i` é incluir ou não:

`dp[i][c] = max(dp[i-1][c], dp[i-1][c - peso[i]] + valor[i])`, se o item cabe.

A tabela 2D é clara, mas o espaço pode ser reduzido para 1D porque a linha `i` só depende da linha `i-1`. A compressão exige iterar a capacidade **de trás para frente**: se você for de frente para trás, `dp[c - peso]` já foi atualizado com o item atual, e o item seria usado mais de uma vez — virando knapsack unbounded.

```java
public class Knapsack01 {

    public static int maxValue(int[] weights, int[] values, int capacity) {
        int[] dp = new int[capacity + 1];

        for (int i = 0; i < weights.length; i++) {
            // De trás para frente preserva o uso único do item.
            for (int c = capacity; c >= weights[i]; c--) {
                dp[c] = Math.max(dp[c], dp[c - weights[i]] + values[i]);
            }
        }
        return dp[capacity];
    }

    public static void main(String[] args) {
        int[] weights = {1, 3, 4, 5};
        int[] values = {1, 4, 5, 7};
        System.out.println(maxValue(weights, values, 7)); // 9 (itens 3 + 4)
    }
}
```

O tempo é O(n · C), que é **pseudo-polinomial**: depende do valor da capacidade, não só do número de bits da entrada. Se `C` for 10^9, a tabela é inviável e o problema muda de natureza (meet-in-the-middle, greedy aproximado ou outra modelagem).

## Na prática

A mesma tabela resolve uma família de problemas.

**Subset sum.** `dp[c]` é booleano: "é possível atingir a soma `c`?". A transição é `dp[c] = dp[c] || dp[c - num]`, também de trás para frente. Partition Equal Subset Sum é subset sum com alvo `soma / 2`; se a soma for ímpar, a resposta é imediatamente falsa.

**Coin change 2 (contagem de combinações).** A ordem dos laços muda o significado. Se você itera moedas por fora e valores por dentro em ordem crescente, conta combinações sem permutações. Se inverte, conta permutações. Essa é uma das armadilhas mais comuns em entrevista.

**Reconstrução.** Para saber quais itens foram escolhidos, guarde a decisão em uma matriz `boolean[][]` ou recrie a escolha voltando pela tabela: se `dp[i][c] != dp[i-1][c]`, o item `i` entrou. Em edit distance, a reconstrução mostra a sequência de operações.

**Strings.** Longest Common Subsequence, Edit Distance e Regular Expression Matching compartilham a estrutura de dois prefixos. A diferença está na transição: LCS usa `dp[i-1][j-1] + 1` quando os caracteres batem; regex adiciona o caso de `*`.

## Armadilhas comuns

- **Esquecer a base da primeira linha ou coluna.** Em edit distance, sem `dp[0][j] = j`, a tabela inteira fica errada.
- **Iterar knapsack para frente.** O item é reutilizado e o resultado vira unbounded.
- **Confundir "exatamente" com "até".** Subset sum quer exatamente a soma; knapsack quer no máximo a capacidade. As bases e a resposta mudam.
- **Ignorar o custo da capacidade.** O(n · C) com C = 10^9 não roda. Leia as restrições antes.
- **Não copiar strings ao reconstruir.** Em problemas de caminho, guardar referências mutáveis produz resultados fantasma.

## Checklist de domínio

- [ ] Você define `dp[i][j]` em uma frase com os dois prefixos ou dimensões
- [ ] Você escreve as bases antes da recorrência
- [ ] Você comprime a tabela para 1D e sabe em qual direção iterar
- [ ] Você distingue 0/1 de unbounded pela direção do laço
- [ ] Você reconhece quando a capacidade torna a DP inviável

## Para ir além

- [CP-Algorithms — Knapsack](https://cp-algorithms.com/dynamic_programming/knapsack.html)
- [LeetCode 72 — Edit Distance](https://leetcode.com/problems/edit-distance/)
- [LeetCode 416 — Partition Equal Subset Sum](https://leetcode.com/problems/partition-equal-subset-sum/)
