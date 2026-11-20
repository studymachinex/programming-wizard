> **Em uma frase:** backtracking é uma DFS sobre o espaço de decisões: escolha, explore, desfaça — e pode tudo o que não pode levar a uma solução válida.

## O problema

"Liste todas as permutações", "gere todos os subconjuntos", "coloque n rainhas em um tabuleiro sem que se ataquem". Esses problemas não pedem o melhor valor; pedem **todas as configurações válidas**. Não há função objetivo para otimizar, e programação dinâmica não se aplica porque a saída é exponencial por natureza.

A tentação é escrever um `for` dentro de outro e perder o controle quando a profundidade varia. Backtracking resolve isso com um template único: uma função recursiva que representa "estou no nível `k` da decisão, com o estado atual `path`". Em cada chamada, você tenta todas as escolhas possíveis, recursa e desfaz. A árvore de recursão é o espaço de busca; as podas cortam galhos que não podem produzir solução.

## Como funciona

O template tem três partes:

1. **Caso base.** Quando o estado está completo, copie para a saída e retorne.
2. **Laço de escolhas.** Para cada escolha válida no estado atual, aplique-a, recursa e desfaça.
3. **Poda.** Antes de recursar, verifique se a escolha pode levar a uma solução. Se não, pule.

A parte que mais se esquece é o **desfazer**. O `path` é mutável e compartilhado entre os ramos; se você adiciona um elemento e não remove, o próximo ramo começa contaminado. O mesmo vale para arrays de `used` e conjuntos de colisão.

Para permutações, a escolha é "qual elemento ainda não foi usado". Para subconjuntos, a escolha é "qual é o próximo elemento a partir de `start`", o que evita gerar `[1,2]` e `[2,1]` como coisas diferentes. Para N-Queens, a escolha é "em qual coluna colocar a rainha da linha atual", e a poda são as colunas e diagonais já atacadas.

```java
import java.util.ArrayList;
import java.util.List;

public class Enumeration {

    public static List<List<Integer>> permute(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        permute(nums, new boolean[nums.length], new ArrayList<>(), result);
        return result;
    }

    private static void permute(int[] nums, boolean[] used,
                                List<Integer> path, List<List<Integer>> result) {
        if (path.size() == nums.length) {
            result.add(new ArrayList<>(path)); // cópia defensiva
            return;
        }
        for (int i = 0; i < nums.length; i++) {
            if (used[i]) {
                continue;
            }
            used[i] = true;
            path.add(nums[i]);

            permute(nums, used, path, result);

            path.remove(path.size() - 1); // desfaz
            used[i] = false;
        }
    }

    public static List<List<Integer>> subsets(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        subsets(nums, 0, new ArrayList<>(), result);
        return result;
    }

    private static void subsets(int[] nums, int start,
                                List<Integer> path, List<List<Integer>> result) {
        result.add(new ArrayList<>(path)); // todo estado é uma solução válida
        for (int i = start; i < nums.length; i++) {
            path.add(nums[i]);
            subsets(nums, i + 1, path, result); // i + 1 evita reordenações
            path.remove(path.size() - 1);
        }
    }
}
```

Em N-Queens, a poda é o que torna a busca viável. Sem ela, o algoritmo testa n^n posições; com os conjuntos de coluna e diagonais, cada linha só tenta colunas livres. A diagonal principal é identificada por `row - col` (deslocado para não ficar negativo) e a secundária por `row + col`.

```java
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class NQueens {

    public static List<List<String>> solve(int n) {
        List<List<String>> result = new ArrayList<>();
        int[] queens = new int[n]; // queens[linha] = coluna
        boolean[] columns = new boolean[n];
        boolean[] diag1 = new boolean[2 * n - 1]; // linha - coluna + n - 1
        boolean[] diag2 = new boolean[2 * n - 1]; // linha + coluna
        dfs(0, n, queens, columns, diag1, diag2, result);
        return result;
    }

    private static void dfs(int row, int n, int[] queens, boolean[] columns,
                            boolean[] diag1, boolean[] diag2,
                            List<List<String>> result) {
        if (row == n) {
            result.add(render(queens));
            return;
        }
        for (int col = 0; col < n; col++) {
            int d1 = row - col + n - 1;
            int d2 = row + col;
            if (columns[col] || diag1[d1] || diag2[d2]) {
                continue;
            }

            queens[row] = col;
            columns[col] = diag1[d1] = diag2[d2] = true;

            dfs(row + 1, n, queens, columns, diag1, diag2, result);

            columns[col] = diag1[d1] = diag2[d2] = false;
        }
    }

    private static List<String> render(int[] queens) {
        List<String> board = new ArrayList<>();
        for (int col : queens) {
            char[] row = new char[queens.length];
            Arrays.fill(row, '.');
            row[col] = 'Q';
            board.add(new String(row));
        }
        return board;
    }
}
```

A complexidade depende do problema. Permutações são O(n · n!): há n! folhas e cada uma custa O(n) para copiar. Subconjuntos são O(n · 2^n). N-Queens é O(n!), mas a poda reduz drasticamente o número de nós visitados na prática.

## Na prática

O template se adapta a quase todo problema de enumeração. A diferença está em três decisões: qual é o estado, qual é o conjunto de escolhas e qual é a condição de poda.

**Duplicatas.** Se a entrada tem valores repetidos, ordene e, no laço, pule `i > start && nums[i] == nums[i-1]`. Isso gera cada combinação única uma vez. Sem a ordenação, a regra não funciona.

**Combination Sum.** O mesmo elemento pode ser reutilizado: a chamada recursiva usa `i`, não `i + 1`. Se cada elemento só pode ser usado uma vez, use `i + 1`. A diferença de um índice muda o problema inteiro.

**Word Search.** O tabuleiro é o estado; a poda é não revisitar uma célula no caminho atual. Marque a célula como visitada antes de recursar e desmarque na volta.

**Quando não usar.** Se o problema pede apenas a contagem ou o melhor valor, e os subproblemas se sobrepõem, DP é melhor. Backtracking enumera; DP agrega. Se você só precisa saber se existe uma solução, uma busca com memoização pode ser suficiente.

## Armadilhas comuns

- **Esquecer o desfazer.** O `path` fica com elementos do ramo anterior e todas as soluções seguintes ficam erradas.
- **Adicionar `path` sem copiar.** `result.add(path)` guarda a referência; no fim, todas as entradas apontam para a mesma lista vazia.
- **Usar `List.of` como path.** É imutável. Use `ArrayList` e remova o último elemento.
- **Não podar.** Sem colisão de colunas/diagonais, N-Queens testa n^n posições em vez de explorar só os ramos viáveis.
- **Profundidade grande.** Backtracking com n = 30 pode estourar a pilha; nesse caso, a saída exponencial já é o gargalo, mas a pilha pode estourar antes.

## Checklist de domínio

- [ ] Você escreve o template escolher-explorar-desfazer sem consultar
- [ ] Você adapta o estado para permutações, subconjuntos e N-Queens
- [ ] Você poda com colisões e ordenação, e explica por que a poda é segura
- [ ] Você calcula a complexidade em função do número de soluções e do custo de copiá-las
- [ ] Você reconhece quando DP é melhor que enumeração

## Para ir além

- [LeetCode 46 — Permutations](https://leetcode.com/problems/permutations/)
- [LeetCode 78 — Subsets](https://leetcode.com/problems/subsets/)
- [LeetCode 51 — N-Queens](https://leetcode.com/problems/n-queens/)
- [CP-Algorithms — Generating Combinations](https://cp-algorithms.com/combinatorics/generating_combinations.html)
