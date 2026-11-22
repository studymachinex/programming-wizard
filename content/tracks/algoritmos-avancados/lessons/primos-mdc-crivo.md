> **Em uma frase:** MDC por Euclides, primalidade até a raiz e o crivo de Eratóstenes resolvem quase toda pergunta de "teoria dos números" que aparece em entrevista — o resto é saber qual dos três o problema pede.

## O problema

Perguntas de matemática assustam mais do que deveriam. Em entrevista de big tech elas aparecem disfarçadas: "conte quantos primos existem abaixo de `n`" (LeetCode 204), "simplifique esta fração", "quantas vezes o padrão de dois semáforos coincide em uma hora", "divida o array em grupos de mesmo tamanho". Nenhuma exige um teorema sofisticado. Todas exigem reconhecer que o problema é sobre **divisibilidade** e escolher entre três ferramentas: MDC, teste de primalidade e crivo.

O erro típico é resolver na força bruta: testar divisores até `n` (O(n) por número) ou testar primalidade de cada número de 2 a `n` separadamente (O(n·√n)). Para `n = 5·10^6`, isso é a diferença entre 30 ms e alguns minutos.

## Como funciona

### MDC e MMC: o algoritmo de Euclides

A ideia é que `mdc(a, b) = mdc(b, a % b)`: qualquer divisor comum de `a` e `b` também divide o resto. O resto diminui pelo menos à metade a cada duas iterações, então o custo é O(log min(a, b)).

```java
public final class Divisibilidade {

    // MDC iterativo: O(log min(a, b)). Funciona com zero: mdc(a, 0) = a.
    static long mdc(long a, long b) {
        a = Math.abs(a);
        b = Math.abs(b);
        while (b != 0) {
            long resto = a % b;
            a = b;
            b = resto;
        }
        return a;
    }

    // MMC: divida ANTES de multiplicar para adiar o overflow.
    static long mmc(long a, long b) {
        if (a == 0 || b == 0) return 0;
        return Math.abs(a / mdc(a, b) * b);
    }

    public static void main(String[] args) {
        System.out.println(mdc(84, 36));   // 12
        System.out.println(mmc(4, 6));     // 12
        System.out.println(mdc(0, 7));     // 7
    }
}
```

O detalhe do `mmc` é o tipo de coisa que entrevistador nota: `a * b / mdc` estoura `long` muito antes de `a / mdc * b`, porque o produto intermediário é maior que o resultado final.

### Primalidade: só até a raiz

Se `n = a · b` com `a ≤ b`, então `a ≤ √n`. Basta testar divisores até a raiz — e, testando 2 à parte, só os ímpares. Custo O(√n), suficiente para checar um número isolado até 10^12.

### O crivo de Eratóstenes

Quando você precisa de **todos** os primos até `n`, testar um por um desperdiça trabalho. O crivo marca os múltiplos de cada primo como compostos. Duas otimizações importam:

1. Comece a marcar em `p * p`: os múltiplos menores já foram marcados por primos menores.
2. Pare o laço externo em `p * p <= n`.

O custo é O(n log log n) — na prática, linear.

```java
import java.util.ArrayList;
import java.util.List;

public final class Crivo {

    // Devolve o crivo: composto[i] == false significa que i é primo (para i >= 2).
    static boolean[] crivo(int n) {
        boolean[] composto = new boolean[n + 1];
        for (int p = 2; (long) p * p <= n; p++) {
            if (composto[p]) continue;
            for (int multiplo = p * p; multiplo <= n; multiplo += p) {
                composto[multiplo] = true;
            }
        }
        return composto;
    }

    // LeetCode 204: quantos primos estritamente menores que n.
    static int contarPrimos(int n) {
        if (n < 3) return 0;
        boolean[] composto = crivo(n - 1);
        int total = 0;
        for (int i = 2; i < n; i++) if (!composto[i]) total++;
        return total;
    }

    // Fatoração por divisão até a raiz: O(sqrt(n)).
    static List<Long> fatorar(long n) {
        List<Long> fatores = new ArrayList<>();
        for (long d = 2; d * d <= n; d++) {
            while (n % d == 0) {
                fatores.add(d);
                n /= d;
            }
        }
        if (n > 1) fatores.add(n); // sobrou um primo maior que a raiz
        return fatores;
    }

    public static void main(String[] args) {
        System.out.println(contarPrimos(10));   // 4 (2, 3, 5, 7)
        System.out.println(fatorar(360));       // [2, 2, 2, 3, 3, 5]
    }
}
```

| Pergunta | Ferramenta | Custo |
|---|---|---|
| `x` é primo? (um número) | divisão até √x | O(√x) |
| Todos os primos até `n` | crivo | O(n log log n) |
| Fatores de um número | divisão até √x | O(√x) |
| Fatores de muitos números até `n` | crivo do menor fator primo | O(n) + O(log x) por número |

A última linha é a variação que mais impressiona: em vez de `boolean[]`, guarde em `menorFator[i]` o primeiro primo que marcou `i`. Depois, fatorar qualquer `x ≤ n` é dividir repetidamente por `menorFator[x]`, em O(log x).

## Na prática

Na entrevista, o MDC aparece mais do que primos. "Duas sequências repetem a cada `a` e `b` passos; quando coincidem?" é MMC. "Dá para dividir o baralho em grupos de tamanho `X ≥ 2` com cartas iguais?" (LeetCode 914) é o MDC das frequências ser ≥ 2. "Rotacionar um array por `k` posições in-place com ciclos" usa `mdc(n, k)` ciclos.

O crivo tem um custo escondido que só aparece com `n` grande: memória. Um `boolean[]` usa 1 byte por posição em Java — 10^8 posições são 100 MB, o suficiente para estourar o heap padrão de um container pequeno. Um `java.util.BitSet` usa 1 bit por posição (12,5 MB), e um crivo só de ímpares corta pela metade de novo. Mencionar esse trade-off sem ser perguntado é sinal de senioridade.

Quando NÃO usar o crivo: se o problema testa primalidade de poucos números grandes (até 10^12), o crivo até `n` é impossível; use divisão até a raiz. Para números ainda maiores, Miller-Rabin — mas isso praticamente não cai em entrevista.

## Armadilhas comuns

- **Overflow no laço `p * p <= n`.** Com `int` e `n` perto de `Integer.MAX_VALUE`, `p * p` estoura e vira negativo. Faça o cast para `long` como no código acima.
- **MDC com negativos.** O operador `%` do Java preserva o sinal do dividendo: `-7 % 3 == -1`. Normalize com `Math.abs` antes, ou o resultado pode sair negativo.
- **Confundir "menor que n" com "até n".** LeetCode 204 pede primos estritamente menores que `n`. Leia a restrição duas vezes; o erro de um elemento é o bug mais comum nesse problema.
- **Começar a marcar em `2 * p`.** Funciona, mas desperdiça trabalho. Começar em `p * p` mostra que você entende por que o algoritmo é correto.

## Para ir além

- [Sieve of Eratosthenes — cp-algorithms](https://cp-algorithms.com/algebra/sieve-of-eratosthenes.html)
- [Euclidean algorithm — cp-algorithms](https://cp-algorithms.com/algebra/euclid-algorithm.html)
- [LeetCode 204 — Count Primes](https://leetcode.com/problems/count-primes/)
- [java.util.BitSet — documentação oficial](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/BitSet.html)
