> **Em uma frase:** a lista dupla compra remoção O(1) com um ponteiro extra por nó; a circular compra a eliminação de casos especiais com a obrigação de nunca perder a âncora.

## O problema

No meio de um editor de texto, o usuário apaga um trecho que está selecionado. Você tem uma referência para o primeiro e o último nó do trecho e precisa removê-lo sem varrer a lista. Em uma lista simples, remover o primeiro nó exige encontrar o anterior — O(n). Em uma lista dupla, o nó conhece o anterior e a remoção é O(1). O mesmo vale para mover um item para o topo de um cache LRU ou para desfazer a última ação de um histórico.

A lista circular resolve outro incômodo: quando o último elemento precisa apontar para o primeiro, todo loop tem um caso especial para o fim. Em um buffer circular de áudio ou em um escalonador round-robin, o "fim" não existe; existe apenas "voltou ao início". O custo é que um ponteiro errado pode criar um loop infinito em vez de um `NullPointerException` — e loops infinitos são mais difíceis de diagnosticar.

## Como funciona

Cada nó tem `prev`, `valor` e `next`. A lista pode ter duas sentinelas (cabeça e cauda) que não guardam dados, formando um anel: `head.next` é o primeiro elemento, `tail.prev` é o último, e as pontas apontam uma para a outra. Com sentinelas, inserir e remover nunca precisam verificar se o vizinho é `null`.

| Operação | Lista simples | Lista dupla | Observação |
|---|---|---|---|
| addFirst | O(1) | O(1) | ajusta 2 ou 4 ponteiros |
| addLast | O(1) com tail | O(1) com tail | sentinela elimina if |
| remove(nó) | O(n) | O(1) | precisa do nó, não do índice |
| mover para frente | O(n) | O(1) | base do LRU |
| memória por nó | valor + next | valor + 2 refs | ~8 bytes extras na JVM |

A implementação abaixo usa sentinelas e expõe as operações que um cache precisa: inserir no início, remover um nó conhecido e mover para o início.

```java
public class DoublyLinkedList {
    static final class Node {
        int valor;
        Node prev;
        Node next;

        Node(int valor) {
            this.valor = valor;
        }
    }

    private final Node head = new Node(0); // sentinela
    private final Node tail = new Node(0); // sentinela
    private int tamanho;

    public DoublyLinkedList() {
        head.next = tail;
        tail.prev = head;
    }

    public int size() {
        return tamanho;
    }

    public void addFirst(int valor) {
        inserirEntre(head, head.next, valor);
    }

    public void addLast(int valor) {
        inserirEntre(tail.prev, tail, valor);
    }

    // Remove um nó já localizado: O(1), sem buscar o anterior.
    public void remove(Node no) {
        if (no == head || no == tail) {
            throw new IllegalArgumentException("não remova sentinelas");
        }
        no.prev.next = no.next;
        no.next.prev = no.prev;
        no.prev = null;
        no.next = null; // ajuda o GC e denuncia uso após remoção
        tamanho--;
    }

    // Move um nó existente para o início: O(1). Base do LRU.
    public void moveToFront(Node no) {
        no.prev.next = no.next;
        no.next.prev = no.prev;
        inserirEntre(head, head.next, no);
    }

    private void inserirEntre(Node antes, Node depois, int valor) {
        Node novo = new Node(valor);
        inserirEntre(antes, depois, novo);
    }

    private void inserirEntre(Node antes, Node depois, Node novo) {
        novo.prev = antes;
        novo.next = depois;
        antes.next = novo;
        depois.prev = novo;
        tamanho++;
    }

    public int[] toArray() {
        int[] out = new int[tamanho];
        int i = 0;
        for (Node n = head.next; n != tail; n = n.next) {
            out[i++] = n.valor;
        }
        return out;
    }

    public static void main(String[] args) {
        DoublyLinkedList lista = new DoublyLinkedList();
        lista.addLast(1);
        lista.addLast(2);
        lista.addLast(3);
        lista.remove(lista.head.next.next); // remove o 2 em O(1)
        System.out.println(java.util.Arrays.toString(lista.toArray())); // [1, 3]
    }
}
```

O detalhe que separa uma implementação correta de uma que "quase funciona" é a ordem das atribuições na remoção e no `moveToFront`. Se você sobrescrever `no.prev` antes de usá-lo para conectar o vizinho, perde a referência. Uma técnica defensiva é sempre desconectar o nó removido (`prev = next = null`): qualquer uso posterior falha rápido, em vez de corromper a lista silenciosamente.

## Na prática

A lista circular aparece quando o domínio é cíclico. Um buffer de áudio de 4.096 amostras, um escalonador que passa a vez entre threads ou um playlist que repete infinitamente não têm "depois do último": têm o próximo, que pode ser o primeiro. O código abaixo implementa o problema de Josephus, em que n pessoas em círculo eliminam a cada k passos — o exemplo canônico de lista circular.

```java
public class Josephus {

    static final class Node {
        int pessoa;
        Node next;

        Node(int pessoa) {
            this.pessoa = pessoa;
        }
    }

    // Retorna a ordem de eliminação. O(n*k) com n pessoas.
    public static int[] ordem(int n, int k) {
        if (n <= 0 || k <= 0) {
            throw new IllegalArgumentException("n e k devem ser positivos");
        }
        Node primeiro = new Node(1);
        Node atual = primeiro;
        for (int i = 2; i <= n; i++) {
            atual.next = new Node(i);
            atual = atual.next;
        }
        atual.next = primeiro; // fecha o círculo

        int[] saida = new int[n];
        Node anterior = atual;
        Node cursor = primeiro;
        for (int i = 0; i < n; i++) {
            for (int passo = 1; passo < k; passo++) {
                anterior = cursor;
                cursor = cursor.next;
            }
            saida[i] = cursor.pessoa;
            anterior.next = cursor.next;
            cursor = cursor.next;
        }
        return saida;
    }

    public static void main(String[] args) {
        System.out.println(java.util.Arrays.toString(ordem(5, 2))); // [2, 4, 1, 5, 3]
    }
}
```

Em uma lista circular, a condição de parada é `no == inicio`, não `no == null`. Se você escrever um `while (no != null)`, o programa entra em loop infinito. Por isso, em código de produção, prefira manter também um contador de tamanho e iterar `for (int i = 0; i < n; i++)` em vez de confiar apenas na comparação de ponteiros.

O custo de memória é concreto: em uma JVM 64-bit com compressed oops, cada referência ocupa 4 bytes; um nó duplo tem 12 bytes de ponteiros (com alinhamento, ~24 bytes no total com o header do objeto). Para 10 milhões de nós, são centenas de megabytes. Se você só precisa de uma fila, `ArrayDeque` usa um array circular sem nós e vence em memória e velocidade. A lista dupla brilha quando a remoção arbitrária O(1) com referência é o requisito central — como no LRU.

## Armadilhas comuns

- **Ordem de reconexão errada.** Em `remove`, ajuste `prev.next` e `next.prev` antes de anular o nó; em `moveToFront`, desconecte e reinsira sem perder as pontas.
- **Sentinelas tratadas como dados.** Um loop que percorre até `null` em uma lista com sentinelas nunca termina; pare em `tail` ou use o tamanho.
- **Ciclo acidental.** Um `addLast` que aponta o último para si mesmo cria um loop silencioso. Teste `toArray()` com tamanho conhecido.
- **Comparar valores em vez de nós.** Para remover, você precisa da referência exata; `equals` de valor pode remover o nó errado se houver duplicatas.
- **Usar lista dupla onde um array bastava.** Dois ponteiros por nó e baixa localidade raramente compensam para menos de alguns milhares de elementos.

## Para ir além

- [OpenJDK — LinkedList](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/LinkedList.java): lista dupla com sentinela? A JDK usa first/last e nós; vale comparar.
- [OpenJDK — ArrayDeque](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/ArrayDeque.java): array circular sem nós, referência para filas e deques.
- [LeetCode — LRU Cache](https://leetcode.com/problems/lru-cache/): onde a lista dupla encontra o HashMap.
