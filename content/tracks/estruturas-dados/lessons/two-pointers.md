> **Em uma frase:** dois ponteiros transformam uma busca quadrática em linear quando você consegue provar que mover um deles nunca descarta a resposta certa.

## O problema

O problema pede dois números em um array que somem um alvo. A solução óbvia testa todos os pares: O(n²). Para 100 mil elementos, são 5 bilhões de combinações. Se o array estiver ordenado, existe uma solução O(n) com dois índices: um no início, outro no fim. A cada passo, você compara a soma com o alvo e move exatamente um ponteiro. Nenhum par é perdido, porque a decisão se baseia na ordem.

Esse é o padrão **two pointers**. Ele aparece em pelo menos quatro formas: ponteiros opostos (two sum ordenado, palíndromo, container com mais água), mesma direção (remover duplicatas, mover zeros), rápido/lento (ciclo, meio da lista) e janela deslizante (que tem aula própria). Reconhecer qual forma usar é mais valioso do que decorar dezenas de soluções.

## Como funciona

A ideia central é manter um **invariante**: a resposta, se existir, está no intervalo fechado `[left, right]`. Em two sum ordenado:

- Se `nums[left] + nums[right] == alvo`, achou.
- Se a soma é menor que o alvo, `nums[left]` é pequeno demais para qualquer `right` atual; como o array está ordenado, nenhum par com esse `left` e um `right` menor pode funcionar. Então `left++`.
- Se a soma é maior, `nums[right]` é grande demais; nenhum par com esse `right` e um `left` maior pode funcionar. Então `right--`.

Cada passo descarta uma linha ou coluna da matriz de pares, sem perder a solução. O número de passos é no máximo n, então O(n). O mesmo raciocínio vale para palíndromo: se as pontas diferem, não há palíndromo possível com aquele intervalo; se são iguais, o miolo é o novo problema.

```java
import java.util.Arrays;

public class TwoPointers {

    // Array ordenado. O(n) tempo, O(1) espaço.
    public static int[] twoSumOrdenado(int[] nums, int alvo) {
        int left = 0;
        int right = nums.length - 1;
        while (left < right) {
            int soma = nums[left] + nums[right];
            if (soma == alvo) {
                return new int[]{left, right};
            }
            if (soma < alvo) {
                left++;
            } else {
                right--;
            }
        }
        return new int[]{-1, -1};
    }

    // Remove duplicatas in-place e retorna o novo tamanho.
    // O(n) tempo, O(1) espaço. O array precisa estar ordenado.
    public static int removerDuplicatas(int[] nums) {
        if (nums.length == 0) {
            return 0;
        }
        int escrita = 1;
        for (int leitura = 1; leitura < nums.length; leitura++) {
            if (nums[leitura] != nums[escrita - 1]) {
                nums[escrita++] = nums[leitura];
            }
        }
        return escrita;
    }

    public static boolean ehPalindromo(String s) {
        int left = 0;
        int right = s.length() - 1;
        while (left < right) {
            if (s.charAt(left) != s.charAt(right)) {
                return false;
            }
            left++;
            right--;
        }
        return true;
    }

    public static void main(String[] args) {
        int[] a = {1, 2, 4, 7, 11};
        System.out.println(Arrays.toString(twoSumOrdenado(a, 9))); // [1, 3]
        int[] b = {0, 0, 1, 1, 2, 3, 3};
        int k = removerDuplicatas(b);
        System.out.println(Arrays.toString(Arrays.copyOf(b, k))); // [0, 1, 2, 3]
        System.out.println(ehPalindromo("arara")); // true
    }
}
```

No `removerDuplicatas`, o ponteiro de escrita nunca ultrapassa o de leitura. A comparação é com `nums[escrita - 1]`, o último valor único já gravado, não com o anterior na posição original. Esse detalhe é o que faz o algoritmo funcionar quando há três ou mais repetições seguidas.

## Na prática

O padrão de mesma direção resolve o problema de mover zeros para o fim mantendo a ordem dos não zeros. Você mantém um índice de escrita e copia cada valor não zero para lá; no fim, preenche o resto com zero. É O(n) e não aloca. O padrão de ponteiros opostos resolve o container com mais água: a área é `min(altura[left], altura[right]) * (right - left)`; mover o lado mais alto nunca aumenta a área, porque a altura limitante continua a mesma e a largura diminui.

```java
public class Padroes {

    public static void moverZeros(int[] nums) {
        int escrita = 0;
        for (int leitura = 0; leitura < nums.length; leitura++) {
            if (nums[leitura] != 0) {
                nums[escrita++] = nums[leitura];
            }
        }
        while (escrita < nums.length) {
            nums[escrita++] = 0;
        }
    }

    public static int maiorArea(int[] alturas) {
        int left = 0;
        int right = alturas.length - 1;
        int melhor = 0;
        while (left < right) {
            int area = Math.min(alturas[left], alturas[right]) * (right - left);
            melhor = Math.max(melhor, area);
            // mover o lado menor é a única chance de aumentar a área
            if (alturas[left] < alturas[right]) {
                left++;
            } else {
                right--;
            }
        }
        return melhor;
    }

    public static void main(String[] args) {
        int[] a = {0, 1, 0, 3, 12};
        moverZeros(a);
        System.out.println(java.util.Arrays.toString(a)); // [1, 3, 12, 0, 0]

        int[] h = {1, 8, 6, 2, 5, 4, 8, 3, 7};
        System.out.println(maiorArea(h)); // 49
    }
}
```

O 3Sum combina ordenação com two pointers: fixa um índice `i`, e resolve two sum no restante. A complexidade é O(n²), mas com metade da constante de três loops. O cuidado é pular duplicatas em todos os níveis: se `nums[i] == nums[i-1]`, pule; depois de encontrar um trio, avance `left` e `right` enquanto os valores forem iguais aos anteriores. Sem isso, o resultado contém trios repetidos, e nenhum conjunto de testes de entrevista perdoa isso.

## Armadilhas comuns

- **Usar dois ponteiros em array não ordenado.** Em two sum, a prova depende da ordem. Sem ordenar, ou use HashMap, ou o algoritmo está errado.
- **Mover o ponteiro errado no container.** Mover o lado mais alto reduz a largura sem aumentar o limitante; a área só pode piorar.
- **Off-by-one no palíndromo.** Use `left < right`, não `left <= right`. Com igualdade, você compara o caractere do meio consigo mesmo à toa; em outras variantes, isso pula um elemento.
- **Esquecer de pular duplicatas no 3Sum.** O mesmo trio aparece várias vezes; a saída correta exige unicidade.
- **Sobrescrever dados ainda não lidos.** No `moverZeros`, o índice de escrita é sempre menor ou igual ao de leitura; se você inverter a ordem de leitura/escrita, perde valores.

## Checklist de domínio

- [ ] Você explica o invariante do two sum ordenado e por que descartar um lado é seguro
- [ ] Você remove duplicatas in-place sem alocar um novo array
- [ ] Você resolve 3Sum pulando duplicatas corretamente
- [ ] Você reconhece quando o padrão é rápido/lento em vez de opostos

## Para ir além

- [LeetCode — Two Sum II](https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/): a versão ordenada que exercita o padrão.
- [LeetCode — 3Sum](https://leetcode.com/problems/3sum/): ordenação + two pointers + deduplicação.
- [Visualgo — Sorting](https://visualgo.net/en/sorting): visualize por que a ordem viabiliza os ponteiros.
