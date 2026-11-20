> **Em uma frase:** depois de ordenar pelo início, fundir intervalos é uma varredura linear: cada intervalo ou começa depois do último bloco e abre um novo, ou o estende.

## O problema

Agendas, faixas de preço, janelas de manutenção, períodos de reserva. Todos compartilham a mesma pergunta: como transformar uma lista de intervalos possivelmente sobrepostos em uma lista de faixas disjuntas? A versão ingênua compara cada par e tenta fundir em todas as ordens, o que é O(n²) e cheio de casos de borda.

O padrão de intervalos é um dos mais rentáveis em entrevista porque a solução é curta, mas o contrato é traiçoeiro. "Sobreposto" inclui tocar? A entrada está ordenada? A saída precisa preservar a ordem? Posso modificar os arrays? Cada uma dessas respostas muda o código.

## Como funciona

A ideia central é ordenar pelo início. Depois disso, os intervalos chegam em uma ordem em que nenhum começo pode ser menor que o começo anterior. Isso permite uma decisão local: comparar o intervalo atual com o **último intervalo já fundido**.

- Se `atual.inicio > ultimo.fim`, não há sobreposição; o atual abre um novo bloco.
- Caso contrário, há sobreposição ou toque; o fim do último bloco vira `max(ultimo.fim, atual.fim)`.

O `max` é essencial para intervalos aninhados. Se você tem `[1,10]` e depois `[2,3]`, o fim continua 10; usar apenas `atual.fim` encolheria o bloco e perderia cobertura.

**Por que a ordenação é suficiente?** Considere a lista ordenada por início. Ao processar o intervalo `i`, todos os anteriores já foram absorvidos nos blocos da saída. Se `i` não se sobrepõe ao último bloco, ele também não pode se sobrepor a nenhum bloco anterior, porque os inícios anteriores são menores ou iguais e os fins dos blocos anteriores são menores que o início do último. Se `i` se sobrepõe ao último, ele é absorvido. Por indução, a saída é a união correta dos intervalos processados.

```java
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class MergeIntervals {

    public static int[][] merge(int[][] intervals) {
        if (intervals.length == 0) {
            return new int[0][];
        }

        // Copia para não mutar a entrada; o contrato pode não permitir.
        int[][] sorted = new int[intervals.length][];
        for (int i = 0; i < intervals.length; i++) {
            sorted[i] = intervals[i].clone();
        }
        // Integer.compare evita overflow de a[0] - b[0].
        Arrays.sort(sorted, (a, b) -> Integer.compare(a[0], b[0]));

        List<int[]> merged = new ArrayList<>();
        for (int[] current : sorted) {
            if (merged.isEmpty() || merged.get(merged.size() - 1)[1] < current[0]) {
                merged.add(new int[] {current[0], current[1]});
            } else {
                int[] last = merged.get(merged.size() - 1);
                last[1] = Math.max(last[1], current[1]);
            }
        }
        return merged.toArray(new int[0][]);
    }

    public static void main(String[] args) {
        int[][] input = {{1, 3}, {2, 6}, {8, 10}, {15, 18}};
        int[][] result = merge(input);
        for (int[] interval : result) {
            System.out.println(Arrays.toString(interval)); // [1, 6], [8, 10], [15, 18]
        }
    }
}
```

A variante de **inserir um intervalo** em uma lista já ordenada e disjunta é ainda mais direta, e é uma pergunta clássica de follow-up. Como a lista já está ordenada, não é preciso reordenar: copie os intervalos que terminam antes do novo, absorva todos os que se sobrepõem, insira o bloco fundido e copie o restante.

```java
import java.util.ArrayList;
import java.util.List;

public class InsertInterval {

    public static int[][] insert(int[][] intervals, int[] newInterval) {
        List<int[]> result = new ArrayList<>();
        int i = 0;
        int n = intervals.length;

        // 1. Tudo que termina antes do novo começo fica intacto.
        while (i < n && intervals[i][1] < newInterval[0]) {
            result.add(intervals[i++]);
        }

        // 2. Absorve tudo que começa antes do fim do bloco em construção.
        int[] merged = newInterval.clone();
        while (i < n && intervals[i][0] <= merged[1]) {
            merged[0] = Math.min(merged[0], intervals[i][0]);
            merged[1] = Math.max(merged[1], intervals[i][1]);
            i++;
        }
        result.add(merged);

        // 3. O restante já está depois e não se sobrepõe.
        while (i < n) {
            result.add(intervals[i++]);
        }
        return result.toArray(new int[0][]);
    }
}
```

A complexidade de `merge` é O(n log n) por causa da ordenação, com O(n) de espaço para a saída. A de `insert` é O(n), pois a entrada já está ordenada. Em ambos os casos, a varredura em si é linear.

## Na prática

O padrão se desdobra em três famílias.

**Fusão.** É o `merge` acima. Use quando a saída são faixas disjuntas que cobrem a mesma área.

**Contagem de sobreposições.** "Quantas salas de reunião são necessárias?" não pede fusão, pede o máximo de intervalos ativos ao mesmo tempo. A solução clássica ordena os inícios e usa um min-heap de fins: para cada reunião, remova do heap os fins que já terminaram e insira o novo fim; o tamanho máximo do heap é o número de salas. Alternativamente, crie eventos `(+1, inicio)` e `(-1, fim)`, ordene e varra, tratando o fim antes do início para permitir reutilizar a sala no mesmo instante.

**Seleção.** "Qual o máximo de intervalos mutuamente compatíveis?" é o problema de interval scheduling, e o guloso correto ordena pelo **fim**, não pelo início. Escolha o intervalo que termina mais cedo, descarte os que conflitam e repita. A prova é por troca: qualquer solução ótima pode substituir seu primeiro intervalo pelo que termina mais cedo sem perder compatibilidade.

**Cobertura.** "Cobrir um alvo com o mínimo de intervalos" é outro guloso: entre os que começam antes do ponto atual, escolha o que estende mais longe. Não confunda com fusão; a saída é um número, não uma lista.

## Armadilhas comuns

- **Usar `a[0] - b[0]` no comparador.** Com extremos de `int`, a subtração estoura e a ordenação fica inconsistente. Use `Integer.compare`.
- **Esquecer o `max` no fim.** Intervalos aninhados encolhem o bloco e produzem cobertura errada.
- **Tratar toque como sobreposição sem clarificar.** `[1,2]` e `[2,3]` fundem com `<=` e não fundem com `<`. O enunciado precisa decidir.
- **Mutar a entrada.** Se o entrevistador reutilizar o array nos testes, a segunda chamada recebe dados alterados.
- **Assumir que a entrada está ordenada.** Se não estiver, ordene; se estiver, diga que está usando essa premissa.

## Checklist de domínio

- [ ] Você explica por que ordenar pelo início permite uma decisão local
- [ ] Você trata intervalos aninhados com `max`
- [ ] Você implementa inserção em lista ordenada sem reordenar
- [ ] Você distingue fusão, contagem de salas e seleção de intervalos
- [ ] Você clarifica a regra de toque antes de codar

## Para ir além

- [LeetCode 56 — Merge Intervals](https://leetcode.com/problems/merge-intervals/)
- [LeetCode 57 — Insert Interval](https://leetcode.com/problems/insert-interval/)
- [LeetCode 253 — Meeting Rooms II](https://leetcode.com/problems/meeting-rooms-ii/)
- [Wikipedia — Interval Scheduling](https://en.wikipedia.org/wiki/Interval_scheduling)
