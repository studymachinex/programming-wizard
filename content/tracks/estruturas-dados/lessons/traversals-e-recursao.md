> **Em uma frase:** traversal é escolher a ordem de visita que responde à pergunta — e a diferença entre recursão e pilha explícita é quem controla a profundidade.

## O problema

Você precisa serializar uma árvore, somar o tamanho de cada subárvore, listar um diretório ou validar uma BST. Cada tarefa pede uma ordem de visita diferente. Usar sempre recursão é cômodo até a árvore virar uma lista de 1 milhão de nós e o `StackOverflowError` derrubar o processo.

## Como funciona

As três travessias DFS diferem no momento em que visitam a raiz. Pré-ordem (raiz, E, D) serve para copiar ou serializar: o pai aparece antes dos filhos. Em ordem (E, raiz, D) produz valores crescentes em uma BST. Pós-ordem (E, D, raiz) serve para liberar memória ou calcular tamanho: os filhos são resolvidos antes do pai.

| Travessia | Ordem | Uso típico | Estrutura |
|---|---|---|---|
| Pré-ordem | raiz, E, D | copiar, serializar | pilha/recursão |
| Em ordem | E, raiz, D | BST ordenada, k-ésimo | pilha/recursão |
| Pós-ordem | E, D, raiz | deletar, calcular altura | pilha/recursão |
| Por nível | nível a nível | menor profundidade | fila |

BFS usa uma fila: processa todos os nós de um nível antes de descer. Para separar níveis, guarde `fila.size()` antes do loop interno; o tamanho muda enquanto você enfileira os filhos.

A profundidade da recursão é a altura da árvore. Java não elimina recursão de cauda, e cada frame consome pilha. Com o stack padrão de 512 KB a 1 MB e frames de ~100 a 200 bytes, o limite prático fica em 5 mil a 10 mil chamadas. A versão iterativa usa uma `ArrayDeque` no heap.

```java
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

public class Arvore {

    static final class No {
        final int valor;
        No esquerda;
        No direita;

        No(int valor) {
            this.valor = valor;
        }
    }

    static List<Integer> preOrdem(No raiz) {
        List<Integer> saida = new ArrayList<>();
        preOrdem(raiz, saida);
        return saida;
    }

    private static void preOrdem(No no, List<Integer> saida) {
        if (no == null) {
            return;
        }
        saida.add(no.valor);
        preOrdem(no.esquerda, saida);
        preOrdem(no.direita, saida);
    }

    static List<Integer> emOrdem(No raiz) {
        List<Integer> saida = new ArrayList<>();
        emOrdem(raiz, saida);
        return saida;
    }

    private static void emOrdem(No no, List<Integer> saida) {
        if (no == null) {
            return;
        }
        emOrdem(no.esquerda, saida);
        saida.add(no.valor);
        emOrdem(no.direita, saida);
    }

    static List<Integer> posOrdem(No raiz) {
        List<Integer> saida = new ArrayList<>();
        posOrdem(raiz, saida);
        return saida;
    }

    private static void posOrdem(No no, List<Integer> saida) {
        if (no == null) {
            return;
        }
        posOrdem(no.esquerda, saida);
        posOrdem(no.direita, saida);
        saida.add(no.valor);
    }

    static List<List<Integer>> porNivel(No raiz) {
        List<List<Integer>> niveis = new ArrayList<>();
        if (raiz == null) {
            return niveis;
        }
        Deque<No> fila = new ArrayDeque<>();
        fila.add(raiz);
        while (!fila.isEmpty()) {
            int tamanhoDoNivel = fila.size();
            List<Integer> nivel = new ArrayList<>(tamanhoDoNivel);
            for (int i = 0; i < tamanhoDoNivel; i++) {
                No no = fila.poll();
                nivel.add(no.valor);
                if (no.esquerda != null) {
                    fila.add(no.esquerda);
                }
                if (no.direita != null) {
                    fila.add(no.direita);
                }
            }
            niveis.add(nivel);
        }
        return niveis;
    }
}
```

DFS custa O(n) no tempo e O(h) no espaço; BFS usa O(w), a largura máxima. Em uma árvore cheia, `w ≈ n/2` no último nível, então BFS pode gastar mais memória que DFS.A versão iterativa de em ordem usa a mesma ideia da recursão: desça até o nó mais à esquerda empilhando o caminho; desempilhe, visite e repita na subárvore direita. Cada nó entra e sai da pilha uma vez, então o custo é O(n).

```java
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

public class EmOrdemIterativo {

    public static List<Integer> emOrdem(Arvore.No raiz) {
        List<Integer> saida = new ArrayList<>();
        Deque<Arvore.No> pilha = new ArrayDeque<>();
        Arvore.No atual = raiz;

        while (atual != null || !pilha.isEmpty()) {
            while (atual != null) {
                pilha.push(atual);
                atual = atual.esquerda;
            }
            Arvore.No no = pilha.pop();
            saida.add(no.valor);
            atual = no.direita;
        }
        return saida;
    }

    public static void main(String[] args) {
        Arvore.No raiz = new Arvore.No(4);
        raiz.esquerda = new Arvore.No(2);
        raiz.direita = new Arvore.No(6);
        raiz.esquerda.esquerda = new Arvore.No(1);
        raiz.esquerda.direita = new Arvore.No(3);
        raiz.direita.esquerda = new Arvore.No(5);
        raiz.direita.direita = new Arvore.No(7);

        System.out.println(Arvore.preOrdem(raiz)); // [4, 2, 1, 3, 6, 5, 7]
        System.out.println(Arvore.emOrdem(raiz));  // [1, 2, 3, 4, 5, 6, 7]
        System.out.println(emOrdem(raiz));         // mesma sequência, sem recursão
        System.out.println(Arvore.posOrdem(raiz)); // [1, 3, 2, 5, 7, 6, 4]
        System.out.println(Arvore.porNivel(raiz)); // [[4], [2, 6], [1, 3, 5, 7]]
    }
}
```

## Na prática

Use pré-ordem para serializar uma árvore reconstruível, com marcadores para filhos ausentes. Use pós-ordem para altura, tamanho ou expressões aritméticas. Use em ordem para BST e k-ésimo menor, com um contador em vez de materializar a lista. Use BFS para menor profundidade ou visão por nível.

Se a árvore é profunda e você não controla a entrada, prefira a versão iterativa. Morris traversal faz em ordem com O(1) de espaço, criando e desfazendo fios temporários para o sucessor; é elegante, mas modifica a árvore durante a execução e não é seguro com leitores concorrentes.

## Armadilhas comuns

- **Capturar `fila.size()` dentro do loop.** O tamanho muda ao enfileirar filhos; você mistura níveis e perde a separação.
- **Usar `ArrayDeque` e inserir `null`.** A estrutura lança `NullPointerException`; teste os filhos antes de enfileirar.
- **Confundir altura com número de nós.** Uma árvore com 1 milhão de nós pode ter altura 20 ou 1 milhão; o custo da recursão depende da altura.
- **Modificar a árvore durante o traversal.** Remover ou inserir nós invalida a pilha implícita e pode pular elementos.

## Checklist de domínio

- [ ] Você escolhe a travessia pela pergunta do problema
- [ ] Você implementa as quatro travessias sem consultar
- [ ] Você escreve em ordem iterativo com pilha explícita
- [ ] Você explica por que uma árvore degenerada estoura a pilha
- [ ] Você compara o espaço de DFS e BFS

## Para ir além

- [LeetCode — Binary Tree Inorder Traversal](https://leetcode.com/problems/binary-tree-inorder-traversal/): pratique a versão iterativa.
- [LeetCode — Binary Tree Level Order Traversal](https://leetcode.com/problems/binary-tree-level-order-traversal/): BFS com níveis.
- [Oracle — ArrayDeque (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayDeque.html): fila e pilha sem sincronização.
