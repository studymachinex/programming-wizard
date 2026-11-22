> **Em uma frase:** corretude em entrevista é um ritual: enumere as bordas antes de codar, prove a complexidade com números e teste na ordem que expõe os bugs mais prováveis.

## O problema

A solução passou no exemplo do enunciado. Você respira, entrega, e o entrevistador digita `[]`. O código lança `ArrayIndexOutOfBoundsException`. Depois ele digita um array de um elemento, e a resposta sai errada por um off-by-one. O algoritmo estava certo; o contrato não.

Bordas não são detalhes. Em produção, a entrada vazia chega no primeiro dia, o valor negativo aparece no relatório e o grafo desconexo existe. Em entrevista, elas são o sinal mais barato de maturidade: quem enumera bordas antes de codar demonstra que pensa em contratos, não só em casos felizes.

O segundo sinal é a complexidade. Dizer "é O(n)" sem olhar para a estrutura auxiliar é metade da resposta. A pergunta real é: "O(n) de tempo e O(1) de espaço, ou O(n) de tempo e O(n) de espaço?". Em entrevistas de nível sênior, a segunda metade é frequentemente a que diferencia.

## Como funciona

**1. Enumere as bordas estruturais.** Não tente adivinhar casos aleatórios; percorra uma taxonomia.

| Tipo de entrada | Bordas que sempre valem testar |
|---|---|
| Array | vazio, um elemento, todos iguais, ordenado, reverso, negativos |
| String | vazia, um caractere, repetidos, espaços, Unicode |
| Lista encadeada | `null`, um nó, dois nós, ciclo |
| Árvore | `null`, um nó, degenerada (lista), nós negativos |
| Grafo | desconexo, ciclo, self-loop, aresta duplicada |
| DP | valor zero, impossível, estouro de soma |

**2. Escreva a complexidade com a conta.** Em vez de decorar, conte: "o laço externo roda n vezes; o interno, no pior caso, n; então n². O `HashSet` cresce até n, então O(n) de espaço. A recursão tem profundidade n, então a pilha é O(n)." Isso pega erros que a intuição esconde.

**3. Teste em camadas.** Primeiro o exemplo do enunciado, para validar o caminho feliz. Depois uma borda, para validar o contrato. Depois um caso adversarial, para tentar quebrar a lógica. Por último, um caso de volume, para confirmar que a complexidade declarada se sustenta. Se o tempo apertar, pelo menos exemplo + borda + adversarial.

**4. Faça um dry run antes de rodar.** Escolha uma entrada pequena e execute o código mentalmente, anotando os valores das variáveis. É mais rápido do que compilar e mais convincente do que "deve funcionar".

O exemplo abaixo é uma busca binária de limite inferior. Ela parece trivial, mas concentra três bordas: array vazio, alvo menor que todos e alvo maior que todos. O cálculo de `mid` usa `lo + (hi - lo) / 2` para não estourar `int` quando os índices são grandes.

```java
public class BinarySearch {

    // Retorna o índice do primeiro elemento >= target.
    // Se todos forem menores, retorna nums.length.
    public static int lowerBound(int[] nums, int target) {
        int lo = 0;
        int hi = nums.length; // intervalo semiaberto [lo, hi)

        while (lo < hi) {
            int mid = lo + (hi - lo) / 2; // evita overflow de lo + hi
            if (nums[mid] < target) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    public static void main(String[] args) {
        System.out.println(lowerBound(new int[] {}, 3));            // 0
        System.out.println(lowerBound(new int[] {7}, 3));           // 0
        System.out.println(lowerBound(new int[] {7}, 7));           // 0
        System.out.println(lowerBound(new int[] {1, 2, 2, 2, 5}, 2)); // 1
        System.out.println(lowerBound(new int[] {1, 2, 2, 2, 5}, 3)); // 4
        System.out.println(lowerBound(new int[] {1, 2, 2, 2, 5}, 9)); // 5
    }
}
```

O teste JUnit abaixo cobre o mesmo contrato de forma repetível. Note que ele testa o **limite**, não só o caso feliz: array vazio, duplicatas, alvo ausente à esquerda e à direita. É esse conjunto que pega o off-by-one clássico de `hi = mid - 1` versus `hi = mid`.

```java
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BinarySearchTest {

    @Test
    void arrayVazioRetornaZero() {
        assertEquals(0, BinarySearch.lowerBound(new int[] {}, 3));
    }

    @Test
    void umElementoMenorQueOAlvo() {
        assertEquals(1, BinarySearch.lowerBound(new int[] {7}, 9));
    }

    @Test
    void umElementoMaiorQueOAlvo() {
        assertEquals(0, BinarySearch.lowerBound(new int[] {7}, 3));
    }

    @Test
    void encontraAPrimeiraOcorrenciaDeDuplicata() {
        assertEquals(1, BinarySearch.lowerBound(new int[] {1, 2, 2, 2, 5}, 2));
    }

    @Test
    void alvoEntreElementosRetornaOProximoMaior() {
        assertEquals(4, BinarySearch.lowerBound(new int[] {1, 2, 2, 2, 5}, 3));
    }

    @Test
    void alvoMaiorQueTodosRetornaTamanho() {
        assertEquals(5, BinarySearch.lowerBound(new int[] {1, 2, 2, 2, 5}, 9));
    }
}
```

## Na prática

Em problemas de grafo, o equivalente ao array vazio é o grafo desconexo. Antes de codar a BFS, decida: o problema garante que todos os nós são alcançáveis? Se não, o laço externo precisa iterar por todos os vértices, não só pela fonte. Em problemas de árvore, a árvore degenerada é a que estoura a pilha: uma árvore com 10^5 nós em linha reta derruba uma DFS recursiva com a pilha padrão da JVM. Nesse caso, ou você usa uma pilha explícita, ou aumenta `-Xss` — mas, em entrevista, a resposta certa é a iterativa.

Em DP, as bordas são os estados-base e a sentinela de impossível. `Integer.MAX_VALUE` parece uma boa sentinela até você somar 1 e virar negativo. Use um valor que não estoure: em coin change, `amount + 1`; em distâncias, uma constante como `10^15` em `long`. E teste o caso "impossível" separadamente, porque é ali que a sentinela vaza para a resposta.

Sobre complexidade, cuidado com custos escondidos: `substring` em Java moderno copia caracteres; concatenar strings em um laço é O(n²); `ArrayList.contains` é O(n); `HashMap` degrada se o `hashCode` for ruim. Se você declarar O(n) e usar uma operação O(n) dentro do laço, a conta real é O(n²). O entrevistador vai perguntar.

## Armadilhas comuns

- **Comparar `Integer` com `==`.** Fora do cache de -128 a 127, a comparação é de referência. Use `equals` ou `intValue()`.
- **Modificar a entrada sem avisar.** Se o contrato permite, ótimo; se não, copie. O entrevistador pode reaproveitar o array nos testes.
- **Ignorar a pilha de recursão.** Uma DFS recursiva em 10^5 nós pode lançar `StackOverflowError` mesmo com complexidade de tempo ótima.
- **Testar só o exemplo.** O exemplo valida o caminho feliz, não o contrato. Sempre adicione uma borda e um adversarial.
- **Declarar complexidade sem contar a estrutura auxiliar.** `HashSet`, `StringBuilder` e a pilha de recursão contam.

## Para ir além

- [JUnit 5 — User Guide](https://junit.org/junit5/docs/current/user-guide/)
- [Oracle — Java Integer API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Integer.html)
- [LeetCode 704 — Binary Search](https://leetcode.com/problems/binary-search/)
