> **Em uma frase:** greedy é uma aposta local que só vira algoritmo quando você prova que nenhuma solução ótima precisa desfazer a escolha gulosa.

## O problema

Greedy é o padrão mais sedutor da entrevista. A solução parece óbvia, o código tem dez linhas, e o candidato sai confiante. Depois descobre que o contraexemplo estava no terceiro teste: moedas de 1, 3 e 4 para formar 6. A escolha gulosa pega 4, depois 1 e 1 — três moedas — enquanto o ótimo é 3 + 3 — duas.

O problema não é o greedy em si; é a ausência de prova. "Funciona nos exemplos" não é argumento. Em entrevista, você precisa articular por que a escolha local não fecha portas que uma solução ótima precisaria. Quando essa prova não existe, o caminho é DP.

## Como funciona

Um algoritmo guloso é correto quando duas propriedades valem:

1. **Propriedade de escolha gulosa:** existe uma solução ótima que contém a escolha local feita pelo algoritmo.
2. **Subestrutura ótima:** depois de fixar essa escolha, o restante do problema é uma instância do mesmo problema, e a solução ótima do restante combina com a escolha.

A ferramenta padrão para provar a primeira é o **argumento de troca**:

1. Considere uma solução ótima `O` que difere do greedy na primeira decisão.
2. Troque a escolha de `O` pela escolha gulosa `g`.
3. Mostre que a nova solução continua viável e tem custo menor ou igual.
4. Conclua por indução que existe uma solução ótima que coincide com o greedy em todas as decisões.

Vejamos **Jump Game**. Você recebe um array em que `nums[i]` é o alcance máximo a partir do índice `i`, e quer saber se dá para chegar ao fim. A escolha gulosa é manter o alcance máximo atingido até agora. Se o índice atual ultrapassa esse alcance, você está preso. Caso contrário, atualize o alcance com `i + nums[i]`.

Por que isso é ótimo? Qualquer caminho que chegue ao índice `i` só pode ter vindo de algum índice `j <= farthest`. Se `i <= farthest`, todos os índices até `i` são alcançáveis pelo mesmo argumento indutivo. O alcance máximo resume toda a informação necessária: não importa **como** você chegou, só **até onde** consegue ir. É uma troca de estado exponencial por um único inteiro.

```java
public class JumpGame {

    public static boolean canJump(int[] nums) {
        if (nums.length <= 1) {
            return true;
        }

        int farthest = 0;
        for (int i = 0; i < nums.length; i++) {
            if (i > farthest) {
                return false; // nem o índice atual é alcançável
            }
            farthest = Math.max(farthest, i + nums[i]);
            if (farthest >= nums.length - 1) {
                return true; // já alcança o fim
            }
        }
        return false;
    }

    public static void main(String[] args) {
        System.out.println(canJump(new int[] {2, 3, 1, 1, 4})); // true
        System.out.println(canJump(new int[] {3, 2, 1, 0, 4})); // false
    }
}
```

**Gas Station** é outro clássico em que o greedy precisa de uma prova em duas partes. Cada posto `i` tem `gas[i]` e custa `cost[i]` para chegar ao próximo. Se a soma total de gasolina for menor que a soma total de custo, é impossível. Se for maior ou igual, existe uma resposta, e o início correto é o posto seguinte ao último ponto em que o tanque acumulado ficou negativo.

A intuição: se você começa em `s` e chega a `i` com tanque negativo, nenhum posto entre `s` e `i` pode ser um início válido, porque todos começariam com menos combustível do que você tinha ao passar por eles. Então o próximo candidato é `i + 1`.

```java
public class GasStation {

    public static int canCompleteCircuit(int[] gas, int[] cost) {
        int total = 0;
        int tank = 0;
        int start = 0;

        for (int i = 0; i < gas.length; i++) {
            int delta = gas[i] - cost[i];
            total += delta;
            tank += delta;

            if (tank < 0) {
                start = i + 1; // nenhum posto entre start e i serve
                tank = 0;
            }
        }
        return total >= 0 ? start : -1;
    }

    public static void main(String[] args) {
        int[] gas = {1, 2, 3, 4, 5};
        int[] cost = {3, 4, 5, 1, 2};
        System.out.println(canCompleteCircuit(gas, cost)); // 3
    }
}
```

Ambos os algoritmos são O(n) de tempo e O(1) de espaço. A prova é o que os torna aceitáveis; sem ela, você tem apenas uma heurística.

## Na prática

Greedy aparece em três formatos recorrentes.

**Seleção de intervalos.** Escolha o intervalo que termina mais cedo, descarte os conflitantes, repita. A prova por troca: em qualquer solução ótima, o primeiro intervalo pode ser substituído pelo que termina mais cedo sem reduzir o número de intervalos restantes.

**Agendamento com recurso.** "Máximo de tarefas concluídas antes do prazo" costuma ser greedy ordenando por prazo, mas com pesos ou múltiplos recursos pode exigir heap ou DP. Desconfie de enunciados com "cada tarefa tem valor" e "duas máquinas".

**Cobertura.** "Mínimo de intervalos para cobrir um alvo" é greedy: entre os que começam antes do ponto atual, escolha o que estende mais longe. "Mínimo de moedas" só é greedy se o sistema de moedas for canônico; em geral, é DP.

Um teste rápido para saber se greedy é suspeito: existe uma escolha local que parece boa, mas depende de valores futuros? Se sim, greedy provavelmente falha. Outro: o problema pede "mínimo/máximo" e as escolhas interagem de forma não trivial? DP é mais seguro.

## Armadilhas comuns

- **Provar com exemplos.** Três casos que funcionam não provam nada. Procure um contraexemplo antes de aceitar a heurística.
- **Escolher o critério errado.** Em interval scheduling, ordenar pelo início ou pela duração falha; o correto é pelo fim.
- **Ignorar empates.** Dois intervalos com o mesmo fim podem exigir um critério de desempate, ou não importar. Verifique.
- **Assumir que "maior primeiro" é sempre ótimo.** Knapsack 0/1 é o contraexemplo clássico: o item de maior valor/peso pode bloquear uma combinação melhor.
- **Esquecer a soma total.** Em Gas Station, verificar apenas o tanque local sem o total leva a retornar um início inválido.

## Para ir além

- [LeetCode 55 — Jump Game](https://leetcode.com/problems/jump-game/)
- [LeetCode 134 — Gas Station](https://leetcode.com/problems/gas-station/)
- [LeetCode 435 — Non-overlapping Intervals](https://leetcode.com/problems/non-overlapping-intervals/)
- [Wikipedia — Greedy Algorithm](https://en.wikipedia.org/wiki/Greedy_algorithm)
