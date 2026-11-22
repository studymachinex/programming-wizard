> **Em uma frase:** DP 1D é escrever a resposta para `i` em função de respostas menores, com uma definição de estado tão precisa que a recorrência quase se escreve sozinha.

## O problema

Você sabe que Fibonacci é recursivo, mas a versão ingênua refaz o mesmo cálculo exponencialmente. Sabe que coin change pede "o mínimo de moedas", mas não sabe por onde começar. Sabe que house robber não pode roubar casas adjacentes, mas a implementação vira uma teia de casos.

O que falta não é sintaxe; é um método para **definir o estado**. Sem isso, cada problema de DP parece novo. Com isso, todos os problemas 1D seguem o mesmo ritual: nomear `dp[i]`, escrever a última decisão, derivar a recorrência, definir as bases e escolher a ordem de iteração.

## Como funciona

Programação dinâmica se aplica quando o problema tem **subestrutura ótima** (a solução ótima usa soluções ótimas de subproblemas) e **subproblemas sobrepostos** (os mesmos subproblemas aparecem várias vezes). A segunda propriedade é o que diferencia DP de divisão e conquista: sem sobreposição, memoizar não economiza nada.

O ritual tem cinco passos:

1. **Defina `dp[i]` em uma frase.** "O número mínimo de moedas para formar o valor `i`." Se a frase precisa de "e também...", provavelmente falta uma dimensão.
2. **Olhe para a última decisão.** No valor `i`, a última moeda escolhida foi `c`. Antes dela, o problema era `i - c`.
3. **Escreva a recorrência.** `dp[i] = 1 + min(dp[i - c])` para toda moeda `c <= i`.
4. **Defina as bases.** `dp[0] = 0`; valores impossíveis recebem uma sentinela.
5. **Escolha a ordem.** Se `dp[i]` depende de `dp[i - c]` com `c > 0`, iterar `i` crescente garante que os menores já foram calculados.

Em **Fibonacci**, `dp[i] = dp[i-1] + dp[i-2]`. A recursão ingênua tem complexidade exponencial porque calcula `fib(3)` muitas vezes. Com memoização, cada estado é resolvido uma vez: O(n) de tempo e O(n) de espaço. Como a recorrência só olha duas posições para trás, dois escalares bastam para O(1) de espaço.

Em **coin change**, a última decisão é a última moeda. Se ela vale `c`, o subproblema é `i - c`. A recorrência é `dp[i] = 1 + min(dp[i-c])` para todas as moedas que cabem. O mínimo é sobre as escolhas da última moeda; a ordem das moedas anteriores não importa, o que evita permutações duplicadas.

```java
import java.util.Arrays;

public class CoinChange {

    public static int coinChange(int[] coins, int amount) {
        // Sentinela maior que qualquer resposta possível (no máximo amount moedas).
        // Evita Integer.MAX_VALUE + 1, que estoura e vira negativo.
        int impossible = amount + 1;
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, impossible);
        dp[0] = 0;

        for (int value = 1; value <= amount; value++) {
            for (int coin : coins) {
                if (coin <= value && dp[value - coin] != impossible) {
                    dp[value] = Math.min(dp[value], dp[value - coin] + 1);
                }
            }
        }
        return dp[amount] == impossible ? -1 : dp[amount];
    }

    public static void main(String[] args) {
        System.out.println(coinChange(new int[] {1, 2, 5}, 11)); // 3 (5 + 5 + 1)
        System.out.println(coinChange(new int[] {2}, 3));        // -1
    }
}
```

Em **house robber**, você não pode roubar duas casas adjacentes. A decisão na casa `i` é binária: roubar ou não. Se roubar, soma `nums[i]` ao melhor resultado até `i-2`; se não, herda o melhor até `i-1`. A recorrência é `dp[i] = max(dp[i-1], dp[i-2] + nums[i])`. Como só dois estados anteriores importam, o espaço cai para O(1).

```java
public class HouseRobber {

    public static int rob(int[] nums) {
        int twoBack = 0; // dp[i-2]
        int oneBack = 0; // dp[i-1]

        for (int value : nums) {
            int current = Math.max(oneBack, twoBack + value);
            twoBack = oneBack;
            oneBack = current;
        }
        return oneBack;
    }

    public static void main(String[] args) {
        System.out.println(rob(new int[] {2, 7, 9, 3, 1})); // 12 (2 + 9 + 1)
        System.out.println(rob(new int[] {2, 1, 1, 2}));    // 4 (2 + 2)
    }
}
```

## Na prática

A escolha entre memoização (top-down) e tabulação (bottom-up) é de engenharia, não de corretude.

| Critério | Memoização | Tabulação |
|---|---|---|
| Facilidade de derivar | Alta: traduz a recorrência | Média: exige ordem |
| Estados visitados | Só os alcançáveis | Todos |
| Risco de stack overflow | Sim, profundidade O(n) | Não |
| Otimização de espaço | Difícil | Natural |

Em entrevista, comece pela memoização se a recorrência for mais clara. Depois, se o entrevistador pedir O(1) de espaço ou se `n` for grande, converta para tabulação. Diga a conversão em voz alta: "a versão top-down é O(n) de tempo e O(n) de espaço; como só preciso de dois estados, posso reduzir para O(1)".

Outro padrão 1D importante é o de **dois estados complementares**, como "melhor com a casa roubada" e "melhor sem". Em vez de `dp[i]`, você mantém `hold` e `sold`, ou `with` e `without`. A recorrência fica mais legível e a transição entre eles modela a restrição.

## Armadilhas comuns

- **Sentinela que estoura.** `Integer.MAX_VALUE + 1` vira negativo. Use `amount + 1` ou uma constante segura em `long`.
- **Ordem de iteração errada.** Em coin change, iterar valores crescentes permite reutilizar moedas (unbounded), que é o desejado. Em 0/1 knapsack, a mesma ordem reutiliza o item e está errada.
- **Esquecer a base.** `dp[0] = 0` parece óbvio, mas em problemas de "formar exatamente" ele é a diferença entre 0 e impossível.
- **Definir estado ambíguo.** "dp[i] é o melhor até i" não diz se o elemento `i` foi incluído. Sem isso, a transição não fecha.
- **Otimizar espaço sem entender a dependência.** Se `dp[i]` depende de `dp[i-2]`, um único escalar não basta.

## Para ir além

- [CP-Algorithms — Introdução a Programação Dinâmica](https://cp-algorithms.com/dynamic_programming/intro-to-dp.html)
- [LeetCode 322 — Coin Change](https://leetcode.com/problems/coin-change/)
- [LeetCode 198 — House Robber](https://leetcode.com/problems/house-robber/)
