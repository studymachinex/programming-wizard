> **Em uma frase:** o entrevistador não lê sua mente; ele avalia o que você verbaliza, então transforme cada decisão em uma frase curta com custo, benefício e alternativa.

## O problema

Dois candidatos resolvem o mesmo problema com o mesmo código. Um recebe "hire", o outro "no hire". A diferença raramente está no algoritmo: está no que aconteceu antes e durante a implementação. O primeiro clarificou as bordas, comparou duas abordagens, escolheu uma com justificativa e testou. O segundo ficou vinte minutos em silêncio, escreveu a solução mais sofisticada que conhecia e não percebeu que o enunciado permitia intervalos que se tocam.

Comunicação em entrevista não é narração de sintaxe ("agora eu abro um `for`"). É **sinalização de decisão**. O entrevistador quer saber se você entende o problema, se consegue avaliar alternativas e se percebe quando está errado. Silêncio prolongado não é sinal de profundidade; é ausência de dados para avaliar.

## Como funciona

O roteiro tem cinco momentos, e cada um tem um tipo de fala associado.

| Momento | O que falar | Exemplo |
|---|---|---|
| Clarificação | Perguntas que mudam a solução | "Os intervalos que se tocam devem ser fundidos?" |
| Exemplos | Um caso feliz e um adversarial | "[1,2],[2,3] funde? E [1,4],[2,3]?" |
| Abordagem | Duas opções com custo | "Ordenar dá O(n log n); varredura sem ordenar é O(n²)." |
| Código | Invariantes, não sintaxe | "Mantenho o último intervalo fundido na saída." |
| Teste | O que pode quebrar | "Vou testar lista vazia, um intervalo e intervalos aninhados." |

A clarificação tem um limite. Faça de três a cinco perguntas de alto impacto, não um interrogatório. As que quase sempre valem:

- A entrada pode ser vazia? Qual o retorno nesse caso?
- Há duplicatas? Elas contam como elementos distintos?
- A entrada está ordenada? Posso ordená-la ou modificar o array?
- Os intervalos são inclusivos? Intervalos que se tocam fundem?
- O resultado precisa ser estável ou em alguma ordem específica?
- Os valores cabem em `int` ou a soma pode estourar?

Perguntas cuja resposta já está nas restrições são ruído. Se o enunciado diz "o array está ordenado em ordem crescente", não pergunte se está ordenado; pergunte se pode haver duplicatas.

Depois da clarificação, **proponha duas abordagens**. Não precisa ser duas ótimas: uma força bruta e uma otimizada já serve. O contraste é o que mostra julgamento. Em seguida, escolha explicitamente e diga por quê. "Vou de heap porque k costuma ser muito menor que n; se k for próximo de n, ordenar é mais simples e provavelmente mais rápido na prática."

Vamos usar merge intervals como exemplo. As perguntas de clarificação definem o contrato: ordenar é permitido, a entrada será copiada, intervalos que se tocam fundem (`<=`) e a saída pode vir em qualquer ordem. O código abaixo torna essas decisões visíveis em comentários — não para o compilador, mas para o entrevistador.

```java
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class MergeIntervals {

    public static int[][] merge(int[][] intervals) {
        if (intervals.length <= 1) {
            return copy(intervals);
        }

        // Decisão: não mutar a entrada original.
        int[][] sorted = copy(intervals);
        Arrays.sort(sorted, (a, b) -> Integer.compare(a[0], b[0]));

        List<int[]> merged = new ArrayList<>();
        for (int[] current : sorted) {
            // Se a lista está vazia ou não há sobreposição, começa um novo bloco.
            if (merged.isEmpty() || merged.get(merged.size() - 1)[1] < current[0]) {
                merged.add(new int[] {current[0], current[1]});
            } else {
                // Sobreposição ou toque: estende o fim se necessário.
                int[] last = merged.get(merged.size() - 1);
                last[1] = Math.max(last[1], current[1]);
            }
        }
        return merged.toArray(new int[0][]);
    }

    private static int[][] copy(int[][] source) {
        int[][] out = new int[source.length][];
        for (int i = 0; i < source.length; i++) {
            out[i] = source[i].clone();
        }
        return out;
    }
}
```

Agora o contraste de trade-offs em um problema de top k. A solução com heap é O(n log k) e O(k); a solução com ordenação é O(n log n) e O(n). Se k = n, o heap faz log n por elemento sem vantagem e ainda paga o custo de manter a estrutura; ordenar é mais direto. Se k = 3 e n = 10^6, o heap é ordens de magnitude melhor.

```java
import java.util.Arrays;
import java.util.PriorityQueue;

public class KthLargest {

    // O(n log k) de tempo, O(k) de espaço.
    public static int withHeap(int[] nums, int k) {
        PriorityQueue<Integer> minHeap = new PriorityQueue<>();
        for (int value : nums) {
            minHeap.offer(value);
            if (minHeap.size() > k) {
                minHeap.poll();
            }
        }
        return minHeap.peek();
    }

    // O(n log n) de tempo, O(n) de espaço. Simples e previsível.
    public static int withSorting(int[] nums, int k) {
        int[] copy = nums.clone();
        Arrays.sort(copy);
        return copy[copy.length - k];
    }

    public static void main(String[] args) {
        int[] nums = {3, 2, 1, 5, 6, 4};
        System.out.println(withHeap(nums, 2));      // 5
        System.out.println(withSorting(nums, 2));   // 5
    }
}
```

## Na prática

Frases que funcionam, em português e em inglês, porque entrevistas de big tech podem ser conduzidas nos dois idiomas:

- "Vou assumir que os intervalos são inclusivos e que tocar conta como sobreposição; se não for o caso, o sinal muda de `<=` para `<`."
- "A força bruta é O(n²), mas ela me dá a base. A otimização vem de manter o último intervalo na saída."
- "Prefiro o heap porque k é pequeno. Se k fosse próximo de n, ordenar seria mais simples e evitaria a estrutura auxiliar."
- "Estou usando `Integer.compare` em vez de subtração para evitar overflow na ordenação."

Quando o entrevistador discordar, não defenda por reflexo. Pergunte qual premissa está errada e refaça o trade-off com a nova informação. "Você tem razão, se a entrada já vem ordenada a varredura é O(n) e não preciso pagar o custo da ordenação." Isso é colaboração, não derrota.

## Armadilhas comuns

- **Clarificar demais.** Dez perguntas seguidas consomem tempo e transmitem insegurança. Priorize as que mudam o algoritmo.
- **Narrar sintaxe.** "Agora eu declaro um `int`" não é raciocínio. Fale de invariantes, escolhas e custos.
- **Não declarar complexidade.** Se você não diz o custo, o entrevistador assume que você não sabe. Diga tempo e espaço, incluindo estruturas auxiliares.
- **Discutir com a dica.** A dica é um teste de colaboração. Incorpore, explique o impacto e siga.
- **Ficar em silêncio ao travar.** Verbalize o bloqueio: "não estou vendo como provar que o ponteiro pode avançar; vou testar um exemplo pequeno".

## Checklist de domínio

- [ ] Você faz de três a cinco perguntas de clarificação que realmente mudam a solução
- [ ] Você apresenta duas abordagens com tempo, espaço e risco antes de escolher
- [ ] Você explica invariantes enquanto codifica, sem narrar sintaxe
- [ ] Você incorpora dicas sem perder o fio da solução
- [ ] Você fecha com complexidade e testes, não com "acho que está certo"

## Para ir além

- [Google Careers — Interview Tips](https://www.google.com/about/careers/applications/interview-tips/)
- [Tech Interview Handbook — Coding Interview Rubrics](https://www.techinterviewhandbook.org/coding-interview-rubrics/)
- [interviewing.io — Blog](https://interviewing.io/blog)
