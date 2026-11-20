> **Em uma frase:** monotonic stack mantém apenas os candidatos que ainda podem responder a alguém — quem já encontrou seu próximo maior nunca mais precisa voltar à pilha.

## O problema

Você tem a temperatura de cada dia e quer saber, para cada dia, quantos dias faltam até uma temperatura maior. A solução ingênua varre para a direita até achar: O(n²). Com 100 mil dias, são 5 bilhões de comparações. O mesmo padrão aparece em "próximo elemento maior", "maior retângulo de histograma", "preço de ação com span", "remover dígitos para formar o menor número" e "água da chuva".

A observação que salva o dia: quando um novo elemento é maior que o topo da pilha, ele é a resposta para o topo. Depois de responder, aquele topo nunca mais será útil para ninguém à direita, porque o novo elemento é maior e está mais perto. Você o descarta. O que sobra na pilha é uma sequência monotônica — daí o nome.

## Como funciona

A pilha guarda **índices**, não valores. Isso permite calcular distâncias e larguras. Para "próximo maior à direita", mantém-se uma pilha com valores decrescentes:

1. Para cada índice `i`, enquanto a pilha não estiver vazia e `nums[topo] < nums[i]`, o próximo maior de `topo` é `i`. Desempilhe.
2. Empilhe `i`.
3. No fim, quem sobrou não tem próximo maior (ou tem -1).

Para "próximo menor", inverta a comparação e a monotonicidade. A escolha entre `<` e `<=` define o que acontece com duplicatas: com `<`, uma ocorrência igual não resolve a anterior, o que é útil quando você quer o próximo estritamente maior; com `<=`, resolve, o que é útil para o próximo maior ou igual.

Cada índice entra uma vez e sai no máximo uma vez. O `while` interno pode parecer O(n²), mas o custo total é O(n): o número de pops é limitado pelo número de pushes.

```java
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;

public class NextGreater {

    // Retorna, para cada posição, o próximo valor estritamente maior à direita.
    // O(n) tempo, O(n) espaço.
    public static int[] proximoMaior(int[] nums) {
        int[] resposta = new int[nums.length];
        Arrays.fill(resposta, -1);
        Deque<Integer> pilha = new ArrayDeque<>(); // índices
        for (int i = 0; i < nums.length; i++) {
            while (!pilha.isEmpty() && nums[pilha.peek()] < nums[i]) {
                resposta[pilha.pop()] = nums[i];
            }
            pilha.push(i);
        }
        return resposta;
    }

    // Dias até temperatura maior. O(n).
    public static int[] diasAteMaior(int[] temperaturas) {
        int[] dias = new int[temperaturas.length];
        Deque<Integer> pilha = new ArrayDeque<>();
        for (int i = 0; i < temperaturas.length; i++) {
            while (!pilha.isEmpty() && temperaturas[pilha.peek()] < temperaturas[i]) {
                int anterior = pilha.pop();
                dias[anterior] = i - anterior;
            }
            pilha.push(i);
        }
        return dias;
    }

    public static void main(String[] args) {
        int[] a = {2, 1, 2, 4, 3};
        System.out.println(Arrays.toString(proximoMaior(a))); // [4, 2, 4, -1, -1]

        int[] t = {73, 74, 75, 71, 69, 72, 76, 73};
        System.out.println(Arrays.toString(diasAteMaior(t))); // [1, 1, 4, 2, 1, 1, 0, 0]
    }
}
```

Em `proximoMaior`, o array de resposta começa com -1. Quando `4` chega no índice 3, ele resolve `2` (índice 2), `2` (índice 0) e `1` (índice 1), nessa ordem. O `3` final fica na pilha sem resposta. A pilha nunca guarda o `4` e o `3` juntos de forma desordenada: os valores são decrescentes da base para o topo.

## Na prática

O maior retângulo de histograma é o problema que separa quem entendeu o padrão de quem só decorou next greater. Para cada barra, você quer a maior largura em que ela ainda é a menor altura. A pilha crescente guarda índices de barras ainda não resolvidas. Quando chega uma barra menor, as barras mais altas encontram seu limite direito; o limite esquerdo é o índice anterior na pilha (ou -1). A largura é `i - esquerda - 1`.

```java
import java.util.ArrayDeque;
import java.util.Deque;

public class Histograma {

    // O(n) tempo, O(n) espaço. Usa uma barra sentinela de altura 0 no fim
    // para desempilhar todo mundo sem código duplicado.
    public static long maiorRetangulo(int[] alturas) {
        int n = alturas.length;
        long melhor = 0;
        Deque<Integer> pilha = new ArrayDeque<>();
        for (int i = 0; i <= n; i++) {
            int alturaAtual = (i == n) ? 0 : alturas[i];
            while (!pilha.isEmpty() && alturas[pilha.peek()] >= alturaAtual) {
                int altura = alturas[pilha.pop()];
                int esquerda = pilha.isEmpty() ? -1 : pilha.peek();
                long largura = (long) i - esquerda - 1;
                melhor = Math.max(melhor, altura * largura);
            }
            pilha.push(i);
        }
        return melhor;
    }

    public static void main(String[] args) {
        int[] h = {2, 1, 5, 6, 2, 3};
        System.out.println(maiorRetangulo(h)); // 10 (5 x 2)
    }
}
```

A sentinela `0` no fim é um truque de produção: sem ela, você precisa de um segundo loop para desempilhar o que restou. Com ela, toda barra é resolvida em um único passe. O `long` na largura e no resultado protege contra overflow quando `altura * largura` passa de 2³¹, o que acontece em histogramas com valores altos.

Outros usos do padrão:

- **Span de ações:** quantos dias consecutivos o preço foi menor ou igual ao de hoje. Pilha decrescente com índices.
- **Remover k dígitos:** manter uma pilha crescente de dígitos e remover o topo quando o dígito atual é menor, até k remoções.
- **Água da chuva:** pilha decrescente de alturas; ao encontrar uma barra maior, calcule a água presa entre as paredes.
- **Validar expressão com operadores de precedência:** pilha monotônica de operadores.

## Armadilhas comuns

- **Guardar valores em vez de índices.** Você perde a distância e a largura. Guarde índices e acesse `nums[i]`.
- **Usar `<=` sem pensar em duplicatas.** Com alturas iguais, `<=` desempilha a barra anterior e calcula largura errada em alguns contextos; `>=` no histograma é o correto para estender a barra atual.
- **Esquecer a sentinela.** Sem o `0` final, sobra gente na pilha e o resultado fica subestimado.
- **Calcular a largura como `i - topo`.** O topo já foi removido; a largura considera o novo topo (ou -1) e subtrai 1.
- **Achar que o while é O(n²).** Cada índice sai uma vez; a análise amortizada é O(n).

## Checklist de domínio

- [ ] Você escolhe pilha crescente ou decrescente a partir do enunciado
- [ ] Você resolve next greater e daily temperatures sem consultar
- [ ] Você calcula o maior retângulo com a largura correta e sentinela
- [ ] Você explica por que o algoritmo é O(n) apesar do loop interno

## Para ir além

- [LeetCode — Daily Temperatures](https://leetcode.com/problems/daily-temperatures/): o padrão em versão direta.
- [LeetCode — Largest Rectangle in Histogram](https://leetcode.com/problems/largest-rectangle-in-histogram/): a variante que cobra a largura.
- [CP-Algorithms — Monotonic Stack](https://cp-algorithms.com/data_structures/stack_queue_modification.html): técnica e variantes.
