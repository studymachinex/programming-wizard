> **Em uma frase:** quando o problema pede "de quantas formas", procure uma fórmula fechada antes da DP — o coeficiente binomial e o triângulo de Pascal transformam enumerações exponenciais em O(n) ou O(1).

## O problema

"Um robô no canto de uma grade `m × n` só anda para a direita ou para baixo. Quantos caminhos existem até o canto oposto?" (LeetCode 62). A solução que todo mundo conhece é uma DP O(m·n). Ela está certa, e você deve saber escrevê-la. Mas o entrevistador sênior costuma emendar: "e se a grade for 10^5 × 10^5?". A DP precisaria de 10^10 células. A resposta é combinatória: todo caminho tem exatamente `m - 1` passos para baixo e `n - 1` para a direita; o que muda é a **ordem**. São `C(m + n - 2, m - 1)` caminhos.

Contagem é onde DP e matemática se encontram. Saber as duas e escolher conscientemente é o que diferencia a resposta "funciona" da resposta "funciona e escala".

## Como funciona

### As quatro perguntas de contagem

| A ordem importa? | Pode repetir? | Fórmula |
|---|---|---|
| sim | não | permutação: `n! / (n-k)!` |
| não | não | combinação: `C(n, k) = n! / (k! (n-k)!)` |
| sim | sim | `n^k` |
| não | sim | "estrelas e barras": `C(n + k - 1, k)` |

Antes de escrever código, classifique o problema nessa tabela em voz alta. Grade com passos fixos é combinação; senhas de 4 dígitos são `10^4`; distribuir 10 bolas iguais em 3 caixas é estrelas e barras: `C(12, 2) = 66`.

### Três jeitos de calcular C(n, k)

**1. Triângulo de Pascal** — `C(n, k) = C(n-1, k-1) + C(n-1, k)`. É uma DP O(n·k) que só usa somas, então funciona com qualquer módulo (primo ou não) e sem divisão.

**2. Produto incremental** — para um único valor sem módulo, multiplique e divida em sequência. O truque é que, após cada passo `i`, o resultado parcial é `C(n-k+i, i)` — sempre inteiro —, então a divisão é exata.

```java
public final class Binomial {

    // C(n, k) exato em long, sem módulo. Usa k = min(k, n - k) para encurtar o laço.
    // Seguro enquanto o resultado (e o produto intermediário) couber em long: n até ~60.
    static long binomial(int n, int k) {
        if (k < 0 || k > n) return 0;
        k = Math.min(k, n - k);
        long resultado = 1;
        for (int i = 1; i <= k; i++) {
            resultado = resultado * (n - k + i) / i; // divisão sempre exata
        }
        return resultado;
    }

    // LeetCode 62: caminhos numa grade m x n.
    static long caminhosNaGrade(int m, int n) {
        return binomial(m + n - 2, m - 1);
    }

    // Pascal: tabela completa até n, só com somas (módulo arbitrário).
    static long[][] pascal(int n, long mod) {
        long[][] c = new long[n + 1][n + 1];
        for (int i = 0; i <= n; i++) {
            c[i][0] = 1 % mod;
            for (int j = 1; j <= i; j++) {
                c[i][j] = (c[i - 1][j - 1] + c[i - 1][j]) % mod;
            }
        }
        return c;
    }

    public static void main(String[] args) {
        System.out.println(caminhosNaGrade(3, 7)); // 28
        System.out.println(binomial(10, 3));       // 120
        System.out.println(pascal(5, 1_000_000_007L)[5][2]); // 10
    }
}
```

**3. Fatoriais pré-calculados com inverso modular** — para muitas consultas com `n` até 10^6 e módulo primo. Pré-calcule `fat[i]` e `invFat[i]` uma vez em O(n); cada consulta vira O(1): `fat[n] · invFat[k] · invFat[n-k]`. O inverso do último fatorial vem de Fermat, e os demais descem multiplicando: `invFat[i-1] = invFat[i] · i`.

```java
public final class Combinacoes {
    static final long M = 1_000_000_007L;
    final long[] fat;
    final long[] invFat;

    Combinacoes(int max) {
        fat = new long[max + 1];
        invFat = new long[max + 1];
        fat[0] = 1;
        for (int i = 1; i <= max; i++) fat[i] = fat[i - 1] * i % M;
        invFat[max] = modPow(fat[max], M - 2);
        for (int i = max; i > 0; i--) invFat[i - 1] = invFat[i] * i % M;
    }

    long c(int n, int k) {
        if (k < 0 || k > n) return 0;
        return fat[n] * invFat[k] % M * invFat[n - k] % M;
    }

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

    public static void main(String[] args) {
        Combinacoes comb = new Combinacoes(200_000);
        // Grade 100000 x 100000: C(199998, 99999) mod M em O(1) após o pré-cálculo.
        System.out.println(comb.c(199_998, 99_999));
        System.out.println(comb.c(5, 2)); // 10
    }
}
```

### Catalan: a sequência que aparece disfarçada

`Cat(n) = C(2n, n) / (n + 1)` conta parênteses balanceados com `n` pares, árvores binárias de busca com `n` nós (LeetCode 96), triangulações de polígono e caminhos que não cruzam a diagonal. Se a DP de um problema tiver a forma `dp[n] = Σ dp[i] · dp[n-1-i]`, é Catalan — e reconhecer isso permite responder a pergunta de follow-up em O(n).

## Na prática

A estratégia de entrevista é: escreva primeiro a DP (o entrevistador quer ver que você sabe), depois ofereça a fórmula como otimização e explique o porquê do ponto de vista de contagem. Isso mostra as duas competências sem arriscar travar procurando a fórmula.

Combinatória também guia decisões fora do quadro branco. Estimar quantos casos de teste uma combinação de feature flags gera (`2^k` com `k` flags), por que testes por pares (*pairwise testing*) existem, ou quantas colisões esperar num hash de `b` bits (o paradoxo do aniversário, ~`2^(b/2)` itens) são todos contagem — e aparecem em entrevistas de system design.

## Armadilhas comuns

- **Calcular `n!` antes de dividir.** `20!` já é o maior fatorial que cabe em `long`; `21!` estoura. Use o produto incremental ou os fatoriais modulares.
- **Usar o inverso modular com módulo não primo.** Se o enunciado pede módulo 10^9 (não primo), Fermat não vale; use Pascal.
- **Esquecer a simetria.** `C(n, k) = C(n, n-k)`. Trocar `k` pelo menor dos dois reduz o laço e o risco de overflow.
- **Classificar errado.** Contar senhas como combinação (sem ordem) é o erro de raciocínio mais comum. Pergunte: trocar dois elementos gera um resultado diferente?

## Para ir além

- [Binomial Coefficients — cp-algorithms](https://cp-algorithms.com/combinatorics/binomial-coefficients.html)
- [Catalan Numbers — cp-algorithms](https://cp-algorithms.com/combinatorics/catalan-numbers.html)
- [LeetCode 62 — Unique Paths](https://leetcode.com/problems/unique-paths/)
- [LeetCode 96 — Unique Binary Search Trees](https://leetcode.com/problems/unique-binary-search-trees/)
