> **Em uma frase:** quando o enunciado diz "devolva a resposta módulo 10^9 + 7", ele está avisando que o número real não cabe em `long` — e que você precisa reduzir a cada operação, exponenciar por quadrados e dividir com inverso modular.

## O problema

"Conte os caminhos", "quantas strings válidas de tamanho `n`", "número de formas de subir a escada" — a resposta cresce exponencialmente. Para `n = 1000`, o número de caminhos tem centenas de dígitos. Por isso o enunciado pede o resultado `% 1_000_000_007`. Candidatos perdem esse tipo de questão não pela lógica, mas pelo overflow silencioso: em Java, `long` estoura sem exceção e o teste falha com um número negativo sem sentido.

Três habilidades resolvem 95% dos casos: reduzir no momento certo, calcular `a^b mod m` em O(log b) e dividir usando o inverso modular.

## Como funciona

### Por que 10^9 + 7

É primo (o que garante inverso modular para todo número não múltiplo dele) e menor que 2^30. A soma de dois valores reduzidos cabe em `int`, e o produto de dois valores reduzidos (< 10^18) cabe em `long` (máximo ≈ 9,2 · 10^18). É exatamente por isso que você pode multiplicar dois resíduos em `long` sem estourar — mas não três.

As regras de redução:

| Operação | Como reduzir |
|---|---|
| Soma | `(a + b) % M` |
| Subtração | `((a - b) % M + M) % M` |
| Multiplicação | `(a % M) * (b % M) % M` em `long` |
| Divisão | `a * inverso(b) % M` — nunca `a / b` |

A subtração é a armadilha clássica: `(5 - 7) % M` em Java dá `-2`, não `M - 2`.

### Exponenciação rápida

Calcular `a^b` multiplicando `b` vezes é O(b) — impossível para `b = 10^18`. A exponenciação por quadrados usa a representação binária do expoente: `a^13 = a^8 · a^4 · a^1`, porque 13 = 1101 em binário. A cada bit, a base é elevada ao quadrado.

```java
public final class ModPow {
    static final long M = 1_000_000_007L;

    // a^b mod m em O(log b). Requer m <= ~3 * 10^9 para o produto caber em long.
    static long modPow(long base, long exp, long m) {
        if (exp < 0) throw new IllegalArgumentException("expoente negativo");
        long resultado = 1 % m;
        base %= m;
        if (base < 0) base += m;
        while (exp > 0) {
            if ((exp & 1) == 1) resultado = resultado * base % m;
            base = base * base % m;
            exp >>= 1;
        }
        return resultado;
    }

    // LeetCode 50 (Pow(x, n)): mesma ideia com double e expoente negativo.
    static double pow(double x, int n) {
        long e = n;              // n = Integer.MIN_VALUE: -n estoura em int
        if (e < 0) { x = 1 / x; e = -e; }
        double r = 1;
        while (e > 0) {
            if ((e & 1) == 1) r *= x;
            x *= x;
            e >>= 1;
        }
        return r;
    }

    public static void main(String[] args) {
        System.out.println(modPow(2, 10, M));          // 1024
        System.out.println(modPow(3, 1_000_000_006, M)); // 1 (pequeno teorema de Fermat)
        System.out.println(pow(2.0, -2));              // 0.25
    }
}
```

O caso `Integer.MIN_VALUE` em `pow` é o teste escondido mais famoso do LeetCode 50: `-(-2147483648)` em `int` continua negativo. Promover para `long` antes de negar resolve.

### Inverso modular

Dividir por `b` módulo um primo `p` é multiplicar pelo número `b⁻¹` tal que `b · b⁻¹ ≡ 1 (mod p)`. Pelo pequeno teorema de Fermat, `b^(p-1) ≡ 1`, logo `b⁻¹ = b^(p-2) mod p`. Com o `modPow` acima, o inverso custa O(log p).

```java
public final class Inverso {
    static final long M = 1_000_000_007L;

    static long modPow(long b, long e) {
        long r = 1;
        b %= M;
        while (e > 0) {
            if ((e & 1) == 1) r = r * b % M;
            b = b * b % M;
            e >>= 1;
        }
        return r;
    }

    // Só vale quando M é primo e b não é múltiplo de M.
    static long inverso(long b) {
        return modPow(b, M - 2);
    }

    public static void main(String[] args) {
        long seis = 6, dois = 2;
        // 6 / 2 mod M, sem divisão inteira:
        System.out.println(seis * inverso(dois) % M); // 3
        // Média modular de 1, 2 e 4: (7 / 3) mod M
        System.out.println(7 * inverso(3) % M);       // 333333338
    }
}
```

Se o módulo não for primo, Fermat não vale; use o algoritmo de Euclides estendido, que funciona sempre que `mdc(b, m) = 1`.

## Na prática

O padrão que mais aparece é DP de contagem: `dp[i] = (dp[i-1] + dp[i-2]) % M`. Reduzir só no final é o bug número um — o `long` estoura por volta do 92º termo de Fibonacci. Reduza dentro do laço, em toda atribuição.

Fora de entrevista, o mesmo raciocínio aparece em produção mais do que parece. Funções de hash como a de `String.hashCode()` são polinômios calculados com overflow controlado (módulo 2^32), e o rolling hash de Rabin-Karp usa exatamente aritmética modular para comparar substrings em O(1). Sistemas de criptografia (RSA) são exponenciação modular com números de milhares de bits — por isso `BigInteger.modPow` existe na biblioteca padrão.

Quando NÃO precisa de nada disso: se a resposta cabe em `long` pelas restrições (por exemplo, `n ≤ 60` em contagem de subconjuntos), pedir módulo seria estranho. Se o entrevistador não falou em módulo e o número cresce, pergunte — é uma ótima pergunta de clarificação.

## Armadilhas comuns

- **Multiplicar três resíduos de uma vez.** `a * b * c % M` estoura: `a * b` já chega a 10^18. Reduza a cada produto: `a * b % M * c % M`.
- **Usar `int` para o produto.** `int * int` estoura antes da conversão para `long`. Declare os operandos como `long` ou use `1L * a * b % M`.
- **Dividir com `/` depois de reduzir.** `(a % M) / b` não é `(a / b) % M`. Depois que você reduziu, a divisão inteira perdeu o sentido; use o inverso.
- **Resultado negativo na subtração.** Some `M` antes do último `%`.

## Para ir além

- [Binary Exponentiation — cp-algorithms](https://cp-algorithms.com/algebra/binary-exp.html)
- [Modular Multiplicative Inverse — cp-algorithms](https://cp-algorithms.com/algebra/module-inverse.html)
- [LeetCode 50 — Pow(x, n)](https://leetcode.com/problems/powx-n/)
- [BigInteger.modPow — documentação oficial](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/math/BigInteger.html)
