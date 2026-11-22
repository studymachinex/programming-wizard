> **Em uma frase:** quando os valores ocupam um range pequeno, contar ocorrências ordena em O(n + k) sem comparar elementos — mas o tamanho de k e a estabilidade decidem se isso é ganho ou armadilha.

## O problema

Todo algoritmo de ordenação baseado em comparação tem um limite inferior de Ω(n log n): com n itens existem n! ordens possíveis e cada comparação só produz dois resultados, então são necessários pelo menos log₂(n!) comparações. Mas esse limite vale para qualquer entrada. Se você sabe que os valores são idades entre 0 e 120, notas de 0 a 100 ou bytes, a informação já está no valor — não é preciso comparar nada. Counting sort explora exatamente isso.

Counting sort troca comparações por memória proporcional ao range `k`. Radix sort estende a ideia para inteiros maiores processando um dígito por vez, mas exige que a ordenação de cada dígito seja estável. Saber quando `O(n + k)` vence `O(n log n)` separa uso consciente de benchmark enganoso.

## Como funciona

Counting sort tem quatro passos: encontrar o mínimo e o máximo, contar cada valor, transformar as contagens em posições finais e escrever a saída de trás para frente. O offset `-min` permite lidar com negativos sem índice negativo. O passo de trás para frente é o que garante estabilidade: ao encontrar valores iguais, o último da entrada ocupa a última posição livre, preservando a ordem relativa.

```java
public class CountingSort {

    public static void ordenar(int[] a) {
        if (a.length < 2) return;
        int min = a[0], max = a[0];
        for (int x : a) {
            min = Math.min(min, x);
            max = Math.max(max, x);
        }
        long range = (long) max - min + 1; // long evita overflow em max - min
        if (range > 10_000_000L) {
            throw new IllegalArgumentException("range grande demais: " + range);
        }
        int k = (int) range;
        int[] count = new int[k];
        for (int x : a) count[x - min]++;
        for (int i = 1; i < k; i++) count[i] += count[i - 1];
        int[] saida = new int[a.length];
        for (int i = a.length - 1; i >= 0; i--) {
            int x = a[i];
            saida[--count[x - min]] = x; // estável: percorre a entrada ao contrário
        }
        System.arraycopy(saida, 0, a, 0, a.length);
    }

    public static void main(String[] args) {
        int[] a = {4, -2, 4, 0, -2, 7};
        ordenar(a);
        System.out.println(java.util.Arrays.toString(a)); // [-2, -2, 0, 4, 4, 7]
    }
}
```

Radix LSD (least significant digit) ordena números de 32 bits em quatro passadas de 8 bits, da menos significativa para a mais significativa. A estabilidade é obrigatória: cada passada precisa preservar a ordem construída pelas anteriores. Para aceitar negativos sem separar o array, o código aplica um viés de sinal: `x ^ Integer.MIN_VALUE` mapeia a ordem com sinal para a ordem sem sinal, e o XOR é desfeito no final.

```java
public class RadixSort {

    private static final int BASE = 256;

    public static void ordenar(int[] a) {
        if (a.length < 2) return;
        for (int i = 0; i < a.length; i++) {
            a[i] ^= Integer.MIN_VALUE; // viés: ordem com sinal vira ordem sem sinal
        }
        int[] buffer = new int[a.length];
        for (int shift = 0; shift < 32; shift += 8) {
            contarPorByte(a, buffer, shift);
            int[] tmp = a;
            a = buffer;
            buffer = tmp;
        }
        // quatro passadas: o resultado volta ao array original
        for (int i = 0; i < a.length; i++) {
            a[i] ^= Integer.MIN_VALUE; // desfaz o viés
        }
    }

    private static void contarPorByte(int[] origem, int[] destino, int shift) {
        int[] count = new int[BASE];
        for (int x : origem) count[(x >>> shift) & 0xFF]++;
        for (int i = 1; i < BASE; i++) count[i] += count[i - 1];
        for (int i = origem.length - 1; i >= 0; i--) {
            int digito = (origem[i] >>> shift) & 0xFF;
            destino[--count[digito]] = origem[i];
        }
    }
}
```

## Na prática

Counting sort vence quando `k` é da mesma ordem que `n`: 1 milhão de notas de 0 a 1000 custa cerca de 1 milhão de incrementos e 1000 posições de memória, contra 20 milhões de comparações de um merge sort. Quando `k` é muito maior que `n` — IDs de 64 bits, por exemplo — o array de contagem domina e a escolha certa volta a ser comparação. A regra prática é comparar `n + k` com `n log n` e checar se o array de contagem cabe no cache.

Radix troca o problema de `k` pelo número de passadas. Com base 256, 32 bits custam quatro passadas e 256 contadores; com base 2¹⁶, duas passadas e 65.536 contadores, que podem não caber no cache. Em produção, counting sort também aparece para ordenar registros por chave pequena: a versão estável escreve o registro inteiro, não apenas a chave, e é isso que preserva os campos associados.

## Armadilhas comuns

- **Calcular `max - min + 1` em `int`.** O range de `Integer.MIN_VALUE` a `Integer.MAX_VALUE` estoura; calcule em `long` antes de alocar.
- **Percorrer a entrada para frente no counting sort.** A ordenação sai correta, mas deixa de ser estável e quebra o radix.
- **Esquecer o offset dos negativos.** Índice negativo lança `ArrayIndexOutOfBoundsException` na primeira iteração.
- **Usar um sort instável em cada dígito do radix.** A ordem dos dígitos anteriores é destruída silenciosamente.
- **Escolher base grande demais.** Contadores demais estouram o cache; o ganho assintótico desaparece na prática.

## Para ir além

- [Java 21 — `Arrays.sort`](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html): variantes da JDK e contratos.
- [Visualgo — Sorting](https://visualgo.net/en/sorting): compare counting e radix com animações.
- [LeetCode — Sort an Array](https://leetcode.com/problems/sort-an-array/): teste as três famílias na mesma entrada.
