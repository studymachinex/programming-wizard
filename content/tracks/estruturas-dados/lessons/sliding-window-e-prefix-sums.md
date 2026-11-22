> **Em uma frase:** sliding window responde perguntas sobre intervalos contíguos sem reexaminar o que já passou; prefix sums respondem somas de intervalo em O(1) depois de O(n) de preparo.

## O problema

Você tem uma string de 100 mil caracteres e quer o maior trecho sem letras repetidas. Testar todos os intervalos é O(n²) (ou pior, se você reconstruir a contagem a cada teste). Em um array de vendas diárias, quer o menor intervalo cuja soma atinja uma meta; em um log de transações, quer contar quantos trechos somam exatamente um valor. Todos são perguntas sobre **subarrays contíguos**, e todos admitem soluções melhores se você mantiver estado incremental em vez de recalcular.

A distinção que organiza o estudo é simples: se a janela pode crescer e encolher de forma monotônica, use sliding window; se você precisa de somas arbitrárias de intervalos, use prefix sums. Confundir as duas leva a janelas que não funcionam com números negativos e a somas recalculadas em O(n) dentro de um loop.

## Como funciona

**Sliding window variável** mantém dois índices, `left` e `right`, e uma estrutura que representa o intervalo `[left, right)`. O `right` avança sempre; o `left` avança somente quando a janela viola uma restrição. O invariante é: a janela atual é válida, e você registra a melhor resposta antes de encolher. Como cada índice avança no máximo n vezes, o custo total é O(n).

**Sliding window fixa** é um caso particular: o tamanho k é dado, você soma os k primeiros, depois adiciona o que entra e remove o que sai. É o padrão de "média móvel" e "máximo em cada janela de k".

**Prefix sums** pré-computam `prefix[i] = soma dos i primeiros elementos`. A soma de `[l, r]` é `prefix[r+1] - prefix[l]`. Com um `HashMap` de frequências de prefixos, você conta subarrays com soma k em O(n): para cada `right`, o número de `left` válidos é a frequência de `prefix[right+1] - k`.

```java
import java.util.HashMap;
import java.util.Map;

public class Janelas {

    // Maior substring sem caracteres repetidos. O(n) tempo, O(1) espaço
    // para alfabeto ASCII; O(min(n, alfabeto)) na prática.
    public static int maiorSemRepetir(String s) {
        Map<Character, Integer> ultimo = new HashMap<>();
        int left = 0;
        int melhor = 0;
        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            Integer visto = ultimo.get(c);
            if (visto != null && visto >= left) {
                left = visto + 1; // pula a ocorrência anterior
            }
            ultimo.put(c, right);
            melhor = Math.max(melhor, right - left + 1);
        }
        return melhor;
    }

    // Menor subarray com soma >= alvo. Funciona com positivos.
    // O(n) tempo, O(1) espaço.
    public static int menorSubarray(int[] nums, int alvo) {
        int left = 0;
        int soma = 0;
        int melhor = Integer.MAX_VALUE;
        for (int right = 0; right < nums.length; right++) {
            soma += nums[right];
            while (soma >= alvo) {
                melhor = Math.min(melhor, right - left + 1);
                soma -= nums[left++];
            }
        }
        return melhor == Integer.MAX_VALUE ? 0 : melhor;
    }

    public static void main(String[] args) {
        System.out.println(maiorSemRepetir("abcabcbb")); // 3
        System.out.println(menorSubarray(new int[]{2, 3, 1, 2, 4, 3}, 7)); // 2
    }
}
```

No `maiorSemRepetir`, a condição `visto >= left` é essencial. Se você apenas fizer `left = visto + 1` sempre, pode mover `left` para trás quando a ocorrência é anterior à janela atual. Exemplo: `"abba"`. Ao chegar no segundo `b`, `left` está em 2; o `b` anterior está em 1, que é menor que `left`, então não há repetição dentro da janela e `left` não deve voltar para 2 (já está). Sem a checagem, `left` recuaria e a janela ficaria inválida.

## Na prática

O prefix sum é a ferramenta certa quando você tem muitas consultas de soma. Se o array muda, um Fenwick tree ou segment tree entra em cena; se é estático, o prefixo é imbatível. O código abaixo implementa as duas operações clássicas e o contador de subarrays com soma k.

```java
import java.util.HashMap;
import java.util.Map;

public class Somas {

    static final class PrefixSum {
        private final long[] prefix;

        PrefixSum(int[] nums) {
            prefix = new long[nums.length + 1];
            for (int i = 0; i < nums.length; i++) {
                prefix[i + 1] = prefix[i] + nums[i];
            }
        }

        // Soma de [l, r], inclusive. O(1).
        long soma(int l, int r) {
            if (l < 0 || r >= prefix.length - 1 || l > r) {
                throw new IndexOutOfBoundsException("intervalo inválido: " + l + ".." + r);
            }
            return prefix[r + 1] - prefix[l];
        }
    }

    // Conta subarrays com soma exata k. O(n) tempo, O(n) espaço.
    // Funciona com negativos, diferente da janela.
    public static int contarSubarrays(int[] nums, int k) {
        Map<Long, Integer> frequencia = new HashMap<>();
        frequencia.put(0L, 1); // prefixo vazio
        long soma = 0;
        int total = 0;
        for (int x : nums) {
            soma += x;
            total += frequencia.getOrDefault(soma - k, 0);
            frequencia.merge(soma, 1, Integer::sum);
        }
        return total;
    }

    public static void main(String[] args) {
        int[] a = {3, 1, 4, 1, 5};
        PrefixSum p = new PrefixSum(a);
        System.out.println(p.soma(1, 3)); // 1 + 4 + 1 = 6

        int[] b = {1, 1, 1};
        System.out.println(contarSubarrays(b, 2)); // 2
    }
}
```

O `prefix` é `long` de propósito. Um array de 100 mil inteiros perto de `Integer.MAX_VALUE` estoura `int` na soma acumulada; o erro aparece só em produção, com dados grandes. O mesmo vale para a soma dentro da janela quando os valores são grandes: `int` pode estourar antes de você comparar com o alvo.

Janela ou prefixo? Use janela quando a restrição é monotônica em relação ao tamanho (todos positivos, ou uma contagem que só piora ao crescer). Use prefixo quando a pergunta é sobre somas exatas e o array pode ter negativos, porque a janela não consegue decidir se deve encolher. Essa é a diferença que separa "funciona nos exemplos" de "funciona no juiz".

## Armadilhas comuns

- **Usar sliding window com negativos em soma.** A soma não é monotônica: adicionar um negativo pode reduzir e um `while` que encolhe pode perder a resposta. Use prefix + HashMap.
- **Esquecer o prefixo vazio.** Sem `frequencia.put(0, 1)`, subarrays que começam no índice 0 não são contados.
- **Mover `left` para trás.** Em janelas com `Map`, só atualize `left` se a ocorrência estiver dentro da janela atual (`visto >= left`).
- **Recalcular a soma da janela a cada passo.** Some o que entra e subtraia o que sai; recalcular é O(n²).
- **Confundir `[left, right]` com `[left, right)`.** O comprimento é `right - left + 1` no intervalo fechado e `right - left` no semiaberto. Escolha um e mantenha.

## Para ir além

- [LeetCode — Longest Substring Without Repeating Characters](https://leetcode.com/problems/longest-substring-without-repeating-characters/): o clássico da janela variável.
- [LeetCode — Subarray Sum Equals K](https://leetcode.com/problems/subarray-sum-equals-k/): prefix sum + HashMap.
- [CP-Algorithms — Prefix Sums](https://cp-algorithms.com/algebra/prefix-sums.html): variantes e provas de complexidade.
