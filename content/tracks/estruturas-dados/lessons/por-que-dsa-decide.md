> **Em uma frase:** estrutura de dados é a decisão que transforma um loop aparentemente inocente em um incidente de produção — ou em uma solução O(n) que passa na entrevista.

## O problema

Um endpoint de recomendação recebe 50 mil IDs de produtos vistos e precisa removê-los de uma lista de 50 mil itens já comprados. O código parece razoável:

```java
for (Long id : vistos) {
    if (comprados.contains(id)) {
        remover(id);
    }
}
```

Cada `contains` em uma `ArrayList` percorre a lista até achar o elemento. No pior caso, são 50 mil comparações por ID, 2,5 bilhões no total. Em uma máquina que faz 100 milhões de comparações por segundo, isso passa de 20 segundos — em um endpoint que deveria responder em 80 ms. Trocar `comprados` por um `HashSet` derruba o custo para 50 mil buscas esperadas O(1): o mesmo código, com uma decisão de estrutura diferente, sai de segundos para milissegundos.

É exatamente isso que entrevistas de DSA tentam medir. Não é decorar a solução do Two Sum; é olhar para um requisito, identificar as operações dominantes e escolher uma estrutura cujo custo caiba no orçamento. Quem só conhece `ArrayList` e `HashMap` superficialmente acerta o problema fácil e travar no médio, porque não reconhece o padrão por trás do enunciado.

## Como funciona

Toda estrutura de dados é uma troca entre quatro recursos: tempo de acesso, tempo de atualização, memória e localidade de cache. A tabela abaixo resume o que você precisa saber de cor para escolher, não para recitar em prova.

| Operação | Array | Linked list | Hash map | BST balanceada |
|---|---|---|---|---|
| Acesso por índice | O(1) | O(n) | — | — |
| Busca por valor | O(n) | O(n) | O(1) esperado | O(log n) |
| Inserir no início | O(n) | O(1) | — | — |
| Inserir no fim | O(1) amortizado | O(1) com tail | O(1) amortizado | O(log n) |
| Memória por item | mínima | ponteiro(s) extra | chave + valor + nó | esquerda/direita/cor |

O ponto que separa quem estudou de quem decorou: essas complexidades descrevem crescimento, não desempenho absoluto. Um array de 100 inteiros pode varrer 100 posições mais rápido do que um `HashMap` calcula um hash e resolve uma colisão, porque os 100 inteiros cabem em poucas linhas de cache. Complexidade assintótica decide quando `n` cresce; constantes e localidade decidem quando `n` é pequeno.

O segundo ponto é que a estrutura certa depende da pergunta. Se você precisa saber *se* um elemento existe, um `HashSet` resolve. Se precisa saber *quantas vezes* ele aparece, um `HashMap<T, Integer>` resolve. Se precisa do *k-ésimo maior*, um heap de tamanho k evita ordenar tudo. O código Java abaixo mostra a diferença entre a solução quadrática e a linear para duplicatas:

```java
import java.util.HashSet;
import java.util.Set;

public class Duplicados {

    // O(n^2) no pior caso: para cada item, varre o restante.
    public static boolean temDuplicataQuadratico(int[] nums) {
        for (int i = 0; i < nums.length; i++) {
            for (int j = i + 1; j < nums.length; j++) {
                if (nums[i] == nums[j]) {
                    return true;
                }
            }
        }
        return false;
    }

    // O(n) esperado: cada elemento entra e é consultado no set uma vez.
    public static boolean temDuplicataLinear(int[] nums) {
        Set<Integer> vistos = new HashSet<>(nums.length * 2);
        for (int n : nums) {
            if (!vistos.add(n)) { // add retorna false se já existia
                return true;
            }
        }
        return false;
    }

    public static void main(String[] args) {
        int[] dados = {4, 8, 15, 16, 23, 42, 8};
        System.out.println(temDuplicataQuadratico(dados)); // true
        System.out.println(temDuplicataLinear(dados));     // true
    }
}
```

O terceiro ponto é que DSA não é só entrevista: é a gramática de sistemas distribuídos e bancos de dados. Índice B-tree do Postgres, cache LRU do Redis, fila de prioridade do agendador do sistema operacional, tabela hash do roteador, topological sort do seu pipeline de build — todos são instâncias dos mesmos conceitos. Aprender a implementar um HashMap não é reinventar a JDK; é entender por que o `HashMap` do Java tem treeificação, por que o `ConcurrentHashMap` tem outro esquema de concorrência e por que uma chave mutável quebra o cache.

## Na prática

Um exemplo de decisão real: extrair os 10 produtos mais vendidos de um milhão de registros. A abordagem ingênua ordena tudo: O(n log n) e um array auxiliar de um milhão de itens. A abordagem com heap mantém apenas 10 candidatos: O(n log 10), ou seja, O(n) na prática, com memória constante. O código é um pouco maior, mas o custo de memória e o tempo caem de forma decisiva.

```java
import java.util.PriorityQueue;

public class TopK {

    // Mantém os k maiores em um min-heap de tamanho k.
    // Tempo O(n log k), espaço O(k). Para k << n, vence ordenar tudo.
    public static int[] maiores(int[] vendas, int k) {
        PriorityQueue<Integer> heap = new PriorityQueue<>(k);
        for (int v : vendas) {
            heap.offer(v);
            if (heap.size() > k) {
                heap.poll(); // sai o menor dos k+1 candidatos
            }
        }
        int[] resultado = new int[heap.size()];
        for (int i = resultado.length - 1; i >= 0; i--) {
            resultado[i] = heap.poll();
        }
        return resultado;
    }

    public static void main(String[] args) {
        int[] vendas = {10, 3, 50, 20, 7, 50, 1};
        System.out.println(java.util.Arrays.toString(maiores(vendas, 3))); // [20, 50, 50]
    }
}
```

Números de latência ajudam a calibrar a intuição: um acesso à L1 custa cerca de 1 ns; à RAM, cerca de 100 ns; uma leitura de SSD, dezenas de microssegundos; um round-trip de rede no mesmo datacenter, cerca de 0,5 ms. Por isso um array de primitivos frequentemente atropela uma estrutura de ponteiros, mesmo quando a complexidade assintótica é a mesma. O compilador JIT e o cache hierárquico não ligam para a sua notação; eles ligam para padrões de acesso previsíveis.

O mapa da trilha segue essa lógica: `complexidade` ensina a medir; `arrays-e-listas` cobre a base contígua e encadeada; `pilhas-e-filas` cobre LIFO/FIFO e a monotonic stack; `hash-maps-e-sets` cobre acesso esperado O(1); `arvores-e-heaps` cobre ordem e prioridade; `ordenacao-e-busca` cobre transformar dados para responder perguntas; `grafos` cobre relações e caminhos. Cada módulo tem exercício de implementação porque ver a estrutura pronta esconde justamente as decisões que importam.

## Armadilhas comuns

- **Trocar tudo por `LinkedList` achando que inserção é sempre O(1).** Só é O(1) se você já tem o nó. Inserir no fim ou acessar o k-ésimo elemento continua O(n).
- **Usar Big-O como cronômetro.** O(1) com hashing e colisões pode perder para O(log n) de uma busca binária em um array pequeno. Meça quando `n` for relevante.
- **Otimizar o loop errado.** Se 90% do tempo está em uma consulta ao banco, micro-otimizar o `for` interno não muda nada. Perfile antes.
- **Memorizar soluções em vez de padrões.** "Vou usar HashMap" não é um padrão; "preciso de busca por chave em tempo esperado constante" é.
- **Ignorar o custo de memória.** Um cache sem limite de tamanho é um vazamento de memória com nome bonito.

## Para ir além

- [MIT 6.006 — Introduction to Algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/): base teórica com aulas completas sobre estruturas e complexidade.
- [Big-O Cheat Sheet](https://www.bigocheatsheet.com/): referência rápida de custos por estrutura e algoritmo.
- [VisuAlgo](https://visualgo.net/en): visualizações interativas de listas, árvores, heaps, grafos e ordenações.
