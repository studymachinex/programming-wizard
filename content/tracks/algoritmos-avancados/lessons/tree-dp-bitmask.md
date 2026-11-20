> **Em uma frase:** tree DP devolve um estado do filho para o pai em pós-ordem; bitmask DP comprime um conjunto de até 20 elementos em um inteiro e memoiza por máscara.

## O problema

Duas dimensões de estado não cabem em um array. Em uma árvore, o estado de um nó depende dos filhos, e você não pode processar o pai antes de conhecer os filhos. Em um problema de subconjuntos, o estado é "quais elementos já foram usados", e um array de booleanos não é uma chave eficiente de memoização.

As duas técnicas resolvem esses casos com a mesma ideia: **comprimir o estado**. Na árvore, o estado é o retorno da recursão. No bitmask, o estado é um inteiro em que cada bit representa um elemento.

## Como funciona

**Tree DP.** A estrutura é sempre a mesma:

1. A recursão recebe um nó e devolve o melhor resultado **daquele nó para baixo**, no formato que o pai precisa.
2. O pai combina os retornos dos filhos.
3. Um valor global (ou um retorno adicional) acumula a resposta que não pode ser expressa como um caminho que sobe.

Em Binary Tree Maximum Path Sum, o caminho pode começar e terminar em qualquer nó. A recursão retorna o maior ganho de um caminho que **desce por um único lado** — porque um caminho que sobe para o pai não pode se bifurcar. O máximo global é atualizado com a soma dos dois lados, que é um caminho completo.

Ganhos negativos são descartados: `max(0, gain(filho))`. Isso permite que o caminho ignore um ramo inteiro. O estado global começa em `Integer.MIN_VALUE`, não em zero, porque a árvore pode ter todos os valores negativos.

```java
public class BinaryTreeMaxPathSum {

    static class TreeNode {
        int val;
        TreeNode left;
        TreeNode right;

        TreeNode(int val) {
            this.val = val;
        }
    }

    private static int best;

    public static int maxPathSum(TreeNode root) {
        best = Integer.MIN_VALUE;
        gain(root);
        return best;
    }

    // Retorna o maior ganho de um caminho que desce por um único lado.
    private static int gain(TreeNode node) {
        if (node == null) {
            return 0;
        }

        int left = Math.max(0, gain(node.left));
        int right = Math.max(0, gain(node.right));

        // Caminho completo: esquerda + nó + direita.
        best = Math.max(best, node.val + left + right);

        // Para o pai, só um lado pode ser escolhido.
        return node.val + Math.max(left, right);
    }
}
```

A complexidade é O(n) de tempo e O(h) de espaço na pilha, onde `h` é a altura. Em uma árvore degenerada, `h = n`, e uma recursão de 10^5 nós pode estourar a pilha padrão da JVM. Em produção, use uma travessia iterativa com pilha explícita ou aumente `-Xss`; em entrevista, mencione o risco.

**Bitmask DP.** Quando `n <= 20`, um subconjunto cabe em um `int`: o bit `i` ligado significa que o elemento `i` foi usado. O estado é a máscara; a transição liga um bit ainda desligado. A memoização usa um array de tamanho `2^n`.

Partition to K Equal Sum Subsets é um exemplo completo. A soma total precisa ser divisível por `k`; o alvo de cada grupo é `sum / k`. A recursão tenta colocar cada número não usado no grupo atual, desde que não ultrapasse o alvo. Quando o grupo fecha, a soma corrente volta a zero. A máscara determina quais números já foram usados; a soma corrente é derivada da máscara, então a máscara é chave suficiente.

```java
import java.util.Arrays;

public class PartitionKEqualSum {

    public static boolean canPartitionKSubsets(int[] nums, int k) {
        int sum = Arrays.stream(nums).sum();
        if (sum % k != 0) {
            return false;
        }

        int target = sum / k;
        Arrays.sort(nums);
        if (nums[nums.length - 1] > target) {
            return false;
        }

        int full = (1 << nums.length) - 1;
        int[] memo = new int[1 << nums.length];
        Arrays.fill(memo, -1); // -1 desconhecido, 0 falso, 1 verdadeiro
        return dfs(0, 0, nums, target, full, memo);
    }

    private static boolean dfs(int mask, int currentSum, int[] nums,
                               int target, int full, int[] memo) {
        if (mask == full) {
            return true;
        }
        if (memo[mask] != -1) {
            return memo[mask] == 1;
        }

        for (int i = 0; i < nums.length; i++) {
            if ((mask & (1 << i)) != 0) {
                continue;
            }
            if (currentSum + nums[i] > target) {
                continue;
            }

            int nextSum = (currentSum + nums[i]) % target;
            if (dfs(mask | (1 << i), nextSum, nums, target, full, memo)) {
                memo[mask] = 1;
                return true;
            }
        }

        memo[mask] = 0;
        return false;
    }
}
```

O tempo é O(n · 2^n) e o espaço é O(2^n). Para `n = 20`, são cerca de um milhão de máscaras; para `n = 25`, 33 milhões, o que já é desconfortável.

## Na prática

**House Robber III.** A árvore não permite roubar pai e filho juntos. Cada nó retorna dois valores: `[melhor sem roubar este nó, melhor roubando este nó]`. O pai combina: se roubar, usa o "sem roubar" dos filhos; se não, escolhe o máximo de cada filho. O retorno é um par, não um escalar.

**Tree diameter.** Cada nó retorna a altura do maior caminho que desce; o diâmetro global é a soma das duas maiores alturas. Mesmo padrão do max path sum, com `1` por aresta.

**TSP e caminhos com máscara.** "Shortest Path Visiting All Nodes" usa BFS com estado `(nó, máscara)`; "Traveling Salesman" usa DP `dp[mask][i]` com transição para um destino não visitado. A máscara é o conjunto de cidades já visitadas.

**Podas de bitmask.** Se dois números são iguais, tentar o segundo depois de o primeiro ter falhado no mesmo estado é redundante. Ordene e pule duplicatas no laço. Se a soma corrente for zero (grupo novo), você pode fixar o primeiro número disponível no grupo, porque todos os grupos são equivalentes.

## Armadilhas comuns

- **Retornar a soma dos dois lados ao pai.** O pai só pode continuar um caminho; a bifurcação é um caminho completo, não um retorno.
- **Inicializar o máximo global em zero.** Uma árvore só com negativos retornaria zero, que não é um caminho válido.
- **Recursão profunda em árvore degenerada.** 10^5 nós em linha reta estouram a pilha padrão.
- **Usar `1 << 31`.** Em Java, o deslocamento com sinal produz um valor negativo. Para 31 bits, use `1L << i` ou restrinja `n <= 30`.
- **Esquecer que a soma corrente é derivada da máscara.** Se você incluir a soma na chave, o memo fica maior sem necessidade; se a soma não for derivável, inclua.

## Checklist de domínio

- [ ] Você define o que a recursão de tree DP retorna ao pai
- [ ] Você distingue retorno local de máximo global
- [ ] Você implementa bitmask DP com máscara, memo e transição de bits
- [ ] Você reconhece os limites de n e o risco de estouro de pilha
- [ ] Você poda estados equivalentes e explica por que a poda é segura

## Para ir além

- [LeetCode 124 — Binary Tree Maximum Path Sum](https://leetcode.com/problems/binary-tree-maximum-path-sum/)
- [LeetCode 337 — House Robber III](https://leetcode.com/problems/house-robber-iii/)
- [LeetCode 698 — Partition to K Equal Sum Subsets](https://leetcode.com/problems/partition-to-k-equal-sum-subsets/)
- [CP-Algorithms — Bit Manipulation](https://cp-algorithms.com/algebra/bit-manipulation.html)
