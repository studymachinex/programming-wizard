> **Em uma frase:** entrevista não premia quem digita mais rápido, e sim quem transforma o enunciado em um padrão conhecido e justifica a escolha antes de codar.

## O problema

Você recebe um enunciado de três parágrafos, um exemplo e uma restrição `n <= 10^5`. O relógio já está correndo. A reação natural é começar a escrever um `for` e descobrir a estrutura no meio do caminho. É exatamente aí que candidatos fortes perdem vagas: o código até funciona no exemplo, mas a abordagem é O(n²) para uma entrada de 100 mil elementos, ou resolve um problema ligeiramente diferente do que foi pedido.

O entrevistador não está avaliando se você já viu aquela pergunta. Ele está avaliando se você consegue **classificar um problema desconhecido rapidamente** e defender uma escolha. Quem reconhece o padrão em cinco minutos passa o restante do tempo implementando, testando e conversando. Quem não reconhece gasta vinte minutos tateando.

Este é o primeiro hábito da trilha: nenhuma linha de código antes de responder três perguntas — qual é a saída, qual é o tamanho da entrada e qual é a versão força bruta?

## Como funciona

O reconhecimento não é intuição mágica. É um funil de quatro passos que você pode executar em voz alta.

**1. Classifique a saída.** O que o problema pede: um número, um booleano, uma lista de elementos, uma lista de combinações, um caminho? "Quantos" e "qual o máximo" tendem a pedir otimização. "Liste todas" tende a pedir enumeração. "Existe" tende a pedir busca ou detecção de ciclo.

**2. Leia as restrições como um orçamento.** Elas dizem qual complexidade cabe:

| Restrição | Orçamento provável | Padrões candidatos |
|---|---|---|
| `n <= 20` | O(2^n) | Bitmask DP, backtracking |
| `n <= 5.000` | O(n²) | DP 2D, LIS quadrática |
| `n <= 10^5` | O(n log n) | Ordenação, heap, dois ponteiros, Fenwick |
| `n <= 10^6` | O(n) | Janela deslizante, hash, varredura linear |

**3. Escreva a força bruta.** Ela é o seu plano B e a sua âncora. Se o entrevistador travar você, uma solução correta e lenta vale mais do que uma solução incompleta e rápida. Além disso, a força bruta revela qual trabalho está sendo repetido — e é isso que a otimização remove.

**4. Procure o sinal estrutural.** O enunciado quase sempre entrega uma pista:

| Sinal | Padrão |
|---|---|
| "subarray/substring contígua" + máximo/mínimo | Janela deslizante |
| "todas as combinações/permutações" | Backtracking |
| "mínimo/máximo" com escolhas repetidas | Programação dinâmica |
| "conectado", "dependência", "ordem" | DFS, BFS, topological sort |
| "k-ésimo", "top k", "mediana" | Heap |
| "intervalos" | Ordenar por início ou fim |
| "próximo maior/menor" | Pilha monotônica |

O erro clássico é casar por palavra-chave. "Encontre a **menor** janela que contém todos os caracteres" tem "menor", mas não é DP: é janela deslizante, porque a propriedade é monotônica — se uma janela é válida, qualquer janela maior que a contenha também é. Já "menor número de moedas" tem "menor" e é DP, porque as escolhas se sobrepõem e não há como encolher uma solução válida preservando validade.

Vejamos o reconhecimento aplicado a um clássico. O problema pede o comprimento da maior substring sem caracteres repetidos. A saída é um número; a entrada é uma string; "substring" significa contígua. A força bruta testa todos os pares de início e fim e usa um `Set` para detectar repetição — O(n²). O trabalho repetido aparece quando movemos o início: a janela antiga já não contém o caractere duplicado, então podemos avançar `left` até depois da última ocorrência, sem reiniciar a contagem.

```java
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class LongestUniqueSubstring {

    // Força bruta: O(n^2) de tempo e O(k) de espaço.
    public static int bruteForce(String s) {
        int best = 0;
        for (int i = 0; i < s.length(); i++) {
            Set<Character> seen = new HashSet<>();
            for (int j = i; j < s.length(); j++) {
                if (!seen.add(s.charAt(j))) {
                    break;
                }
                best = Math.max(best, j - i + 1);
            }
        }
        return best;
    }

    // Janela deslizante: cada índice entra e sai no máximo uma vez. O(n).
    public static int slidingWindow(String s) {
        int[] lastIndex = new int[128]; // ASCII; para Unicode, use Map<Character, Integer>
        Arrays.fill(lastIndex, -1);
        int best = 0;
        int left = 0;

        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            if (lastIndex[c] >= left) {
                left = lastIndex[c] + 1; // pula a ocorrência anterior
            }
            lastIndex[c] = right;
            best = Math.max(best, right - left + 1);
        }
        return best;
    }

    public static void main(String[] args) {
        String s = "abcabcbb";
        System.out.println(bruteForce(s));     // 3
        System.out.println(slidingWindow(s));  // 3
    }
}
```

O mesmo raciocínio se generaliza para "menor janela que contém todos os caracteres de `t`". A diferença é que a validade não é "sem repetição", e sim "frequências da janela cobrem as frequências de `t`". O template é o mesmo: expandir `right`, contrair `left` enquanto válido, registrar o melhor.

```java
import java.util.HashMap;
import java.util.Map;

public class MinimumWindowSubstring {

    public static String minWindow(String s, String t) {
        if (t.isEmpty() || s.length() < t.length()) {
            return "";
        }

        Map<Character, Integer> need = new HashMap<>();
        for (char c : t.toCharArray()) {
            need.merge(c, 1, Integer::sum);
        }

        Map<Character, Integer> window = new HashMap<>();
        int required = need.size();
        int formed = 0;
        int left = 0;
        int bestLen = Integer.MAX_VALUE;
        int bestLeft = 0;

        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            window.merge(c, 1, Integer::sum);
            if (need.containsKey(c) && window.get(c).intValue() == need.get(c).intValue()) {
                formed++;
            }

            while (formed == required) {
                if (right - left + 1 < bestLen) {
                    bestLen = right - left + 1;
                    bestLeft = left;
                }
                char out = s.charAt(left++);
                if (need.containsKey(out)) {
                    if (window.get(out).intValue() == need.get(out).intValue()) {
                        formed--;
                    }
                    window.merge(out, -1, Integer::sum);
                }
            }
        }

        return bestLen == Integer.MAX_VALUE ? "" : s.substring(bestLeft, bestLeft + bestLen);
    }
}
```

## Na prática

O protocolo de cinco minutos, aplicado a **Container With Most Water**: você recebe alturas e deve escolher duas linhas que, com o eixo x, formem o maior recipiente. A saída é uma área; a entrada é um array; não há pedido de subarray. A força bruta testa todos os pares, O(n²). O sinal "duas extremidades e área" sugere dois ponteiros: comece com a maior largura e mova o ponteiro de menor altura, porque mover o mais alto nunca aumenta a área — a largura diminui e a altura continua limitada pelo mais baixo. Isso é um argumento de troca, e você deve dizê-lo em voz alta antes de codar.

Na entrevista, verbalize o funil: "A saída é um comprimento, a entrada tem até 10^5, então O(n²) não passa. A propriedade de janela é monotônica, então vou testar sliding window. Se não funcionar, caio para DP." Isso dá ao entrevistador um mapa do seu raciocínio e abre espaço para ele corrigir o rumo cedo, quando a correção ainda é barata.

## Armadilhas comuns

- **Casar por palavra-chave.** "Menor", "máximo" e "ótimo" aparecem em DP, greedy, janela e busca binária. Classifique pela estrutura da saída e pelas restrições, não pelo adjetivo.
- **Ignorar as restrições.** Uma solução O(n²) correta para `n = 10^5` é uma solução errada na prática. Leia os limites antes de escolher.
- **Pular a força bruta.** Sem ela, você não sabe qual trabalho está repetido e não tem plano B se a otimização falhar.
- **Confundir substring com subsequência.** Substring é contígua; subsequência não. Essa diferença muda o algoritmo inteiro e é uma pergunta de clarificação obrigatória.

## Checklist de domínio

- [ ] Você consegue classificar um problema pela saída e pelas restrições em menos de dois minutos
- [ ] Você escreve a força bruta antes de propor a otimização
- [ ] Você reconhece os sinais de janela, DP, backtracking, heap e grafo sem depender de palavra-chave
- [ ] Você consegue explicar por que o padrão escolhido é válido, não apenas que ele existe

## Para ir além

- [Tech Interview Handbook — Coding Interview Study Plan](https://www.techinterviewhandbook.org/coding-interview-study-plan/)
- [LeetCode — Problemset](https://leetcode.com/problemset/)
- [CP-Algorithms — visão geral de algoritmos](https://cp-algorithms.com/)
