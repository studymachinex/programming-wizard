> **Em uma frase:** mantenha a metade menor em um max-heap e a metade maior em um min-heap; os dois topos são a mediana, e o balanceamento garante que isso continue verdadeiro a cada inserção.

## O problema

Você precisa responder à mediana de um stream de números. Cada `addNum` chega online, e `findMedian` pode ser chamado a qualquer momento. A solução ingênua guarda tudo em uma lista e ordena a cada consulta: O(n log n) por chamada. A segunda tentativa mantém a lista ordenada com inserção binária: a busca é O(log n), mas o deslocamento dos elementos é O(n).

Em um stream com milhões de eventos — latência de requests, preços de ações, notas de alunos chegando em tempo real — nenhuma das duas escala. O padrão de dois heaps resolve as duas operações em O(log n) e O(1), com O(n) de memória. É um dos raros casos em que a estrutura certa elimina a ordenação por completo.

## Como funciona

A mediana divide os dados em duas metades: os menores e os maiores. Se você conseguir manter essas metades separadas e saber o maior da metade menor e o menor da metade maior, a mediana está nos topos.

- `lower` é um **max-heap** com a metade menor. O topo é o maior elemento dessa metade.
- `upper` é um **min-heap** com a metade maior. O topo é o menor elemento dessa metade.

Duas invariantes precisam valer depois de cada inserção:

1. **Ordem:** todo elemento de `lower` é menor ou igual a todo elemento de `upper`.
2. **Tamanho:** `lower.size()` é igual a `upper.size()` ou exatamente um maior.

Com isso, se o total é ímpar, a mediana é `lower.peek()`. Se é par, é a média de `lower.peek()` e `upper.peek()`.

A inserção é onde a maioria dos candidatos erra. O algoritmo robusto é sempre o mesmo:

1. Insira o novo número em `lower`.
2. Mova o topo de `lower` para `upper`. Isso garante que o maior da metade menor vá para a metade maior, corrigindo a ordem.
3. Se `upper` ficou maior que `lower`, mova o topo de `upper` de volta para `lower`. Isso corrige o tamanho.

Esse fluxo funciona para qualquer ordem de chegada e para duplicatas. Não é necessário comparar o novo número com os topos: as duas movimentações forçam a invariante.

```java
import java.util.Collections;
import java.util.PriorityQueue;

public class MedianFinder {

    // Max-heap: a metade menor. O topo é o maior dessa metade.
    private final PriorityQueue<Integer> lower =
            new PriorityQueue<>(Collections.reverseOrder());

    // Min-heap: a metade maior. O topo é o menor dessa metade.
    private final PriorityQueue<Integer> upper = new PriorityQueue<>();

    public void addNum(int num) {
        lower.offer(num);              // 1. entra na metade menor
        upper.offer(lower.poll());     // 2. o maior vai para a metade maior
        if (upper.size() > lower.size()) {
            lower.offer(upper.poll()); // 3. reequilibra os tamanhos
        }
    }

    public double findMedian() {
        if (lower.size() > upper.size()) {
            return lower.peek();
        }
        // Cast para long antes da soma evita overflow de int.
        return ((long) lower.peek() + upper.peek()) / 2.0;
    }
}
```

O custo é O(log n) por inserção, porque cada `offer`/`poll` em um heap é logarítmico e fazemos no máximo três operações. `findMedian` é O(1). O espaço é O(n).

Um detalhe que separa implementação de entrevista de implementação de produção: **não confie na invariante sem testá-la**. O harness abaixo compara o resultado do `MedianFinder` com a mediana calculada por ordenação, em 200 sequências aleatórias. Ele pega erros de balanceamento que um exemplo manual não pega.

```java
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

public class MedianFinderCheck {

    public static void main(String[] args) {
        Random random = new Random(42);

        for (int trial = 0; trial < 200; trial++) {
            MedianFinder finder = new MedianFinder();
            List<Integer> values = new ArrayList<>();

            for (int i = 0; i < 50; i++) {
                int value = random.nextInt(200) - 100;
                finder.addNum(value);
                values.add(value);
                Collections.sort(values);

                int n = values.size();
                double expected = (n % 2 == 1)
                        ? values.get(n / 2)
                        : (values.get(n / 2 - 1) + values.get(n / 2)) / 2.0;

                if (Math.abs(finder.findMedian() - expected) > 1e-9) {
                    throw new AssertionError("Divergência no trial " + trial);
                }
            }
        }
        System.out.println("Todos os trials passaram.");
    }
}
```

## Na prática

O padrão aparece sempre que você precisa de acesso aos elementos centrais de um conjunto dinâmico: medianas de latência em um sistema de observabilidade, filtro de valores extremos, divisão de um conjunto em duas metades balanceadas.

Existem alternativas com trade-offs diferentes. Se todos os valores são conhecidos de antemão, você pode comprimir as coordenadas e usar uma Fenwick tree para encontrar o k-ésimo em O(log n), com menos memória constante. Se você precisa da mediana de uma **janela deslizante**, os dois heaps sozinhos não bastam: é preciso remover elementos que saem da janela, o que exige lazy deletion (marcar o elemento como removido e limpar o topo quando ele aparecer) ou uma estrutura com remoção arbitrária. Em Java, `TreeMap` com contagem de ocorrências resolve, mas o código fica mais longo.

Em entrevista, diga a alternativa e por que não a escolheu. "Vou de dois heaps porque só preciso de inserção e consulta; se houvesse remoção, precisaria de lazy deletion ou de uma ordem estatística." Isso mostra que você conhece o limite do padrão.

## Armadilhas comuns

- **Não reequilibrar depois de cada inserção.** Se `upper` ficar maior que `lower`, os topos deixam de representar os elementos centrais.
- **Usar um único heap.** Um heap só dá acesso ao mínimo ou ao máximo, nunca aos dois lados da mediana.
- **Divisão inteira.** `(lower.peek() + upper.peek()) / 2` trunca o resultado. Use `2.0` e faça o cast para `long` antes da soma.
- **Esquecer duplicatas.** O algoritmo funciona com valores repetidos, mas testes que assumem valores únicos não pegam o problema.
- **Achar que `findMedian` pode ser O(log n).** Com as invariantes mantidas, os topos estão sempre disponíveis; a consulta é O(1).

## Checklist de domínio

- [ ] Você enuncia as duas invariantes antes de escrever código
- [ ] Você implementa `addNum` com as três etapas e explica por que a ordem funciona
- [ ] Você calcula a mediana ímpar e par corretamente, sem overflow
- [ ] Você sabe quando o padrão não se aplica (remoção arbitrária, janela deslizante)
- [ ] Você testa com duplicatas e sequências aleatórias, não só com o exemplo

## Para ir além

- [LeetCode 295 — Find Median from Data Stream](https://leetcode.com/problems/find-median-from-data-stream/)
- [Oracle — PriorityQueue API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/PriorityQueue.html)
- [Wikipedia — Heap (data structure)](https://en.wikipedia.org/wiki/Heap_(data_structure))
