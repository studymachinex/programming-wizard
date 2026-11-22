> **Em uma frase:** XOR cancela pares, `x & (x - 1)` apaga o bit mais baixo e um `int` é um conjunto de até 32 elementos — três ideias que resolvem em O(1) de memória problemas que pareciam pedir um `HashMap`.

## O problema

"Num array, todo número aparece duas vezes, menos um. Encontre-o em O(n) de tempo e O(1) de memória" (LeetCode 136). Com um `HashSet` é trivial — e é exatamente a resposta que o entrevistador vai recusar por causa da memória. Problemas de bits são populares em entrevista porque têm uma solução óbvia e cara e uma solução elegante e barata, e a distância entre elas mede se você entende como os números são representados.

Eles também aparecem disfarçados: gerar todos os subconjuntos, verificar se um número é potência de dois, contar bits de 0 a `n`, representar permissões, guardar o estado "quais cidades já visitei" numa DP com bitmask.

## Como funciona

### Os operadores e o complemento de dois

Em Java, `int` tem 32 bits em complemento de dois: `-x == ~x + 1`. Isso explica os truques:

| Expressão | Efeito | Exemplo (x = 12 = 1100) |
|---|---|---|
| `x & (x - 1)` | apaga o bit 1 mais baixo | `1000` (8) |
| `x & -x` | isola o bit 1 mais baixo | `0100` (4) |
| `x ^ x` | zero | `0000` |
| `(x >> i) & 1` | lê o bit `i` | `i = 2` → 1 |

`x & -x` é o mesmo truque que move a Fenwick tree. E `x & (x - 1) == 0` testa potência de dois em O(1) — desde que `x > 0`.

### XOR: o operador que cancela

XOR é comutativo, associativo, `a ^ a = 0` e `a ^ 0 = a`. Então XOR de todos os elementos cancela os pares e sobra o elemento único. A mesma ideia encontra o número que falta em `0..n` (LeetCode 268): XOR dos índices com os valores.

```java
public final class TruquesXor {

    // LeetCode 136: O(n) tempo, O(1) memória.
    static int unico(int[] nums) {
        int acumulado = 0;
        for (int x : nums) acumulado ^= x;
        return acumulado;
    }

    // LeetCode 268: o número que falta em 0..n.
    static int faltando(int[] nums) {
        int x = nums.length;
        for (int i = 0; i < nums.length; i++) x ^= i ^ nums[i];
        return x;
    }

    // Dois números únicos (os demais em pares): separe pelo bit em que eles diferem.
    static int[] doisUnicos(int[] nums) {
        int xorDosDois = 0;
        for (int x : nums) xorDosDois ^= x;
        int bitDiferente = xorDosDois & -xorDosDois; // um bit onde os dois diferem
        int a = 0;
        for (int x : nums) if ((x & bitDiferente) != 0) a ^= x;
        return new int[] {a, xorDosDois ^ a};
    }

    public static void main(String[] args) {
        System.out.println(unico(new int[] {4, 1, 2, 1, 2}));          // 4
        System.out.println(faltando(new int[] {3, 0, 1}));             // 2
        int[] par = doisUnicos(new int[] {1, 2, 1, 3, 2, 5});
        System.out.println(par[0] + " " + par[1]);                     // 3 5 (em alguma ordem)
    }
}
```

### Contar bits e o caso "aparece três vezes"

`Integer.bitCount(x)` conta os bits 1 com uma instrução de CPU (`POPCNT`) — use em produção. Em entrevista, pedem a versão manual: `while (x != 0) { x &= x - 1; total++; }` itera só pelos bits ligados. Para contar bits de 0 a `n` (LeetCode 338), há uma DP de uma linha: `bits[i] = bits[i >> 1] + (i & 1)`.

Quando todos aparecem **três** vezes e um só uma vez (LeetCode 137), XOR não cancela. Conte, para cada uma das 32 posições, quantos números têm aquele bit ligado: o resto da divisão por 3 é o bit do número único.

```java
public final class Contagens {

    // LeetCode 338: bits de 0 a n em O(n).
    static int[] contarBits(int n) {
        int[] bits = new int[n + 1];
        for (int i = 1; i <= n; i++) bits[i] = bits[i >> 1] + (i & 1);
        return bits;
    }

    // LeetCode 137: todos aparecem 3 vezes, exceto um. Funciona com negativos.
    static int unicoEntreTriplos(int[] nums) {
        int resultado = 0;
        for (int bit = 0; bit < 32; bit++) {
            int soma = 0;
            for (int x : nums) soma += (x >>> bit) & 1;
            if (soma % 3 != 0) resultado |= 1 << bit;
        }
        return resultado;
    }

    // Subconjuntos por máscara: cada inteiro de 0 a 2^n - 1 é um subconjunto.
    static void imprimirSubconjuntos(char[] itens) {
        int n = itens.length;
        for (int mascara = 0; mascara < (1 << n); mascara++) {
            StringBuilder sb = new StringBuilder("{");
            for (int i = 0; i < n; i++) if ((mascara & (1 << i)) != 0) sb.append(itens[i]);
            System.out.println(sb.append('}'));
        }
    }

    public static void main(String[] args) {
        System.out.println(java.util.Arrays.toString(contarBits(5))); // [0, 1, 1, 2, 1, 2]
        System.out.println(unicoEntreTriplos(new int[] {-2, -2, 7, -2})); // 7
        imprimirSubconjuntos(new char[] {'a', 'b', 'c'});
    }
}
```

## Na prática

Bitmask é a ponte para a DP de estados da aula de tree DP e bitmask DP: "quais cidades já visitei" com `n ≤ 20` cabe num `int`, e a tabela `dp[mascara][cidade]` tem `2^20 · 20 ≈ 2·10^7` células — viável. Acima de ~25 elementos, `2^n` explode; essa é a pista nas restrições.

Em produção, bits aparecem em lugares que valem citar: o `HashMap` do Java usa `hash & (capacidade - 1)` em vez de `%`, por isso a capacidade é sempre potência de dois; permissões Unix (`rwx` = 7) e flags de enum compactas (`EnumSet` é um `long` por baixo) são máscaras; bloom filters e bitmaps de índice em bancos analíticos usam exatamente esses operadores.

Quando NÃO usar: legibilidade importa. Em código de negócio, `Set<Permissao>` ou `EnumSet` comunicam melhor que uma máscara de `int`, e o ganho de memória raramente compensa. Reserve os truques para caminhos quentes e para a entrevista.

## Armadilhas comuns

- **Precedência de operadores.** Em Java, `==` tem precedência maior que `&`: `x & 1 == 0` não compila (vira `x & (1 == 0)`). Sempre use parênteses: `(x & 1) == 0`.
- **`>>` versus `>>>`.** `>>` replica o bit de sinal; com negativos, um laço `while (x != 0) x >>= 1` nunca termina. Use `>>>` para deslocar como sem sinal.
- **`1 << 31` é negativo** e `1 << 32` é `1` (o deslocamento usa só os 5 bits baixos). Para máscaras de até 63 bits, use `1L << i`.
- **Potência de dois com zero.** `0 & (0 - 1) == 0`, então o teste ingênuo diz que 0 é potência de dois. Exija `x > 0`.

## Checklist de domínio

- [ ] Você explica por que `x & -x` isola o bit mais baixo usando complemento de dois
- [ ] Você resolve "único entre pares" e "único entre triplos" em O(1) de memória
- [ ] Você enumera subconjuntos com máscara e sabe o limite prático de `n`
- [ ] Você evita as armadilhas de precedência e de `>>` com negativos

## Para ir além

- [Bit manipulation — cp-algorithms](https://cp-algorithms.com/algebra/bit-manipulation.html)
- [Integer (bitCount, numberOfTrailingZeros) — documentação oficial](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Integer.html)
- [LeetCode 136 — Single Number](https://leetcode.com/problems/single-number/)
- [LeetCode 137 — Single Number II](https://leetcode.com/problems/single-number-ii/)
