> **Em uma frase:** a linked list troca acesso aleatório por atualizações locais O(1) — e essa troca quase sempre custa mais do que parece.

## O problema

Você precisa manter uma lista de tarefas em que o usuário insere e remove itens no meio o tempo todo, e já tem uma referência para o item a remover. Com um array, remover esse item exige deslocar todos os seguintes: O(n). Com uma linked list, basta ajustar dois ponteiros: O(1). Parece a estrutura perfeita — até você precisar acessar o décimo item ou iterar sobre 10 milhões de nós e descobrir que cada `next` é um salto para uma região diferente da memória.

Linked list não é "array melhor". É uma estrutura com um perfil específico: atualizações locais baratas quando você já está no nó, e péssima localidade. Entender esse perfil evita o clássico "vou usar LinkedList porque inserção é O(1)" que termina mais lento que `ArrayList` em quase todos os benchmarks reais.

## Como funciona

Cada nó é um objeto com um valor e uma referência para o próximo. A lista mantém uma referência para `head` (e opcionalmente `tail`). O último nó aponta para `null`. Não há garantia de que os nós estejam próximos na memória; o alocador pode espalhá-los, e cada travessia é uma sequência de desreferências imprevisíveis.

| Operação | Array | Linked list simples |
|---|---|---|
| Acessar índice i | O(1) | O(n) |
| Inserir no início | O(n) | O(1) |
| Inserir no fim | O(1) amortizado | O(1) com tail |
| Remover nó conhecido | O(n) | O(1) com prev |
| Memória por item | 4 bytes (int) | objeto + referência (~24 bytes) |
| Localidade | alta | baixa |

A implementação abaixo cobre o essencial e o reverse iterativo. Note o uso de uma classe `Node` estática: uma classe interna não estática guardaria uma referência implícita para a lista, aumentando o custo por nó.

```java
public class SinglyLinkedList {
    private static final class Node {
        int valor;
        Node next;

        Node(int valor) {
            this.valor = valor;
        }
    }

    private Node head;
    private Node tail;
    private int tamanho;

    public int size() {
        return tamanho;
    }

    public void addFirst(int valor) {
        Node novo = new Node(valor);
        novo.next = head;
        head = novo;
        if (tail == null) {
            tail = novo;
        }
        tamanho++;
    }

    public void addLast(int valor) {
        Node novo = new Node(valor);
        if (tail == null) {
            head = novo;
            tail = novo;
        } else {
            tail.next = novo;
            tail = novo;
        }
        tamanho++;
    }

    // O(n) tempo, O(1) espaço. Inverte os ponteiros no lugar.
    public void reverse() {
        Node prev = null;
        Node curr = head;
        tail = head; // o antigo head vira o novo tail
        while (curr != null) {
            Node next = curr.next; // salva antes de sobrescrever
            curr.next = prev;
            prev = curr;
            curr = next;
        }
        head = prev;
    }

    public int[] toArray() {
        int[] out = new int[tamanho];
        int i = 0;
        for (Node n = head; n != null; n = n.next) {
            out[i++] = n.valor;
        }
        return out;
    }

    public static void main(String[] args) {
        SinglyLinkedList lista = new SinglyLinkedList();
        lista.addLast(1);
        lista.addLast(2);
        lista.addLast(3);
        lista.reverse();
        System.out.println(java.util.Arrays.toString(lista.toArray())); // [3, 2, 1]
    }
}
```

O reverse é o exercício mais cobrado de linked list porque testa três coisas: salvar o `next` antes de sobrescrever, atualizar `prev`/`curr` na ordem correta e não perder a nova cabeça. Um erro de ordem produz uma lista truncada ou um ciclo infinito — e o teste unitário com três elementos pega isso imediatamente.

## Na prática

O segundo padrão fundamental é o **two pointers lento/rápido** (Floyd). O lento anda um nó, o rápido anda dois. Se houver ciclo, eles se encontram; se não, o rápido chega ao fim. O mesmo esquema encontra o meio da lista em uma passada, sem saber o tamanho. O código abaixo mostra as duas funções:

```java
public class ListaUtil {

    static final class Node {
        int valor;
        Node next;

        Node(int valor) {
            this.valor = valor;
        }
    }

    // Floyd: O(n) tempo, O(1) espaço.
    public static boolean temCiclo(Node head) {
        Node lento = head;
        Node rapido = head;
        while (rapido != null && rapido.next != null) {
            lento = lento.next;
            rapido = rapido.next.next;
            if (lento == rapido) {
                return true;
            }
        }
        return false;
    }

    // Retorna o segundo nó do meio em listas pares.
    public static Node meio(Node head) {
        Node lento = head;
        Node rapido = head;
        while (rapido != null && rapido.next != null) {
            lento = lento.next;
            rapido = rapido.next.next;
        }
        return lento;
    }

    public static void main(String[] args) {
        Node a = new Node(1);
        a.next = new Node(2);
        a.next.next = new Node(3);
        a.next.next.next = a.next; // ciclo 2 -> 3 -> 2

        System.out.println(temCiclo(a)); // true
        System.out.println(temCiclo(new Node(1))); // false
    }
}
```

Em produção, linked lists aparecem onde o custo de mover elementos é proibitivo ou onde a estrutura precisa ser estável sob inserções: listas de adjacência de grafos, buffers de log, implementações de LRU (lista dupla), filas concorrentes e o `LinkedList` do Java. Mas mesmo nesses casos, muitas implementações modernas preferem arrays de índices (como um `int[] next` para cada nó) para recuperar localidade — o "pool de nós" mantém os ponteiros em arrays contíguos e evita milhões de objetos.

## Armadilhas comuns

- **Perder o `next` no reverse.** Sem salvar `curr.next` antes de reescrevê-lo, você perde o resto da lista. A ordem das quatro atribuições é o algoritmo.
- **Não atualizar `tail`.** Depois do reverse, o antigo `head` é o novo `tail`; se você esquecer, o próximo `addLast` corrompe a lista.
- **Comparar valores em vez de referências no Floyd.** `lento == rapido` funciona porque são os mesmos nós; comparar `valor` gera falso positivo.
- **Achar que `LinkedList.get(i)` é barato.** A JDK percorre do início ou do fim, o que for mais perto: O(n). Um loop com `get(i)` é O(n²).
- **Vazar memória ao remover.** Em Java, remova a referência do nó anterior; em C/C++, libere o nó. Em uma lista circular, um nó esquecido mantém o ciclo inteiro vivo.

## Checklist de domínio

- [ ] Você inverte uma lista simples iterativamente sem consultar
- [ ] Você detecta ciclo e encontra o meio com dois ponteiros
- [ ] Você explica por que a linked list perde em localidade para o array
- [ ] Você reconhece quando um nó sentinela elimina casos especiais

## Para ir além

- [OpenJDK — LinkedList](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/LinkedList.java): implementação com nós e `get` que percorre a partir da ponta mais próxima.
- [LeetCode — Reverse Linked List](https://leetcode.com/problems/reverse-linked-list/): pratique o padrão com testes automáticos.
- [Visualgo — Linked List](https://visualgo.net/en/list): veja as operações de ponteiro passo a passo.
