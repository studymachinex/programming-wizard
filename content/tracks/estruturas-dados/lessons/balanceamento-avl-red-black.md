> **Em uma frase:** árvore balanceada não é sobre ser bonita — é sobre garantir que a altura cresça em log n mesmo com inserções ordenadas.

Uma BST simples inserindo 1, 2, 3, 4, 5 vira uma lista ligada. A busca deixa de ser O(log n) e passa a O(n). AVL e Red-Black resolvem isso com rotações e regras de cor/altura, mantendo a altura limitada.

## O problema

Você mantém um índice ordenado em memória para consultas por faixa. Com dados aleatórios, a BST funciona; com IDs sequenciais, degrada. Um `TreeMap` do Java já resolve, mas entender o custo de manter ordem é o que diferencia usar de confiar.

## Como funciona

**AVL:** em cada nó, `|altura(esq) - altura(dir)| <= 1`. Após inserir/remover, sobe atualizando alturas e aplica rotações simples ou duplas. É mais rígida: altura ~1,44 log n, busca muito rápida, mais rotações na escrita.

**Red-Black:** cada nó é vermelho ou preto; raiz preta; filho de vermelho é preto; todo caminho tem o mesmo número de pretos. Altura <= 2 log(n+1). Menos rotações na escrita, usada por `TreeMap` e `HashMap` treeified.

```java
class Avl {
    static class Node {
        int key, height = 1;
        Node left, right;
        Node(int key) { this.key = key; }
    }

    Node insert(Node node, int key) {
        if (node == null) return new Node(key);
        if (key < node.key) node.left = insert(node.left, key);
        else if (key > node.key) node.right = insert(node.right, key);
        else return node;

        node.height = 1 + Math.max(h(node.left), h(node.right));
        int balance = h(node.left) - h(node.right);

        if (balance > 1 && key < node.left.key) return rightRotate(node);
        if (balance < -1 && key > node.right.key) return leftRotate(node);
        if (balance > 1 && key > node.left.key) {
            node.left = leftRotate(node.left);
            return rightRotate(node);
        }
        if (balance < -1 && key < node.right.key) {
            node.right = rightRotate(node.right);
            return leftRotate(node);
        }
        return node;
    }

    int h(Node n) { return n == null ? 0 : n.height; }

    Node rightRotate(Node y) {
        Node x = y.left;
        y.left = x.right;
        x.right = y;
        y.height = 1 + Math.max(h(y.left), h(y.right));
        x.height = 1 + Math.max(h(x.left), h(x.right));
        return x;
    }

    Node leftRotate(Node x) {
        Node y = x.right;
        x.right = y.left;
        y.left = x;
        x.height = 1 + Math.max(h(x.left), h(x.right));
        y.height = 1 + Math.max(h(y.left), h(y.right));
        return y;
    }
}
```

## Na prática

Use `TreeMap`/`TreeSet` quando precisa de ordem, `floor/ceiling`, range queries e não pode depender de hash. Para concorrência, `ConcurrentSkipListMap` oferece ordem com menos contenção que uma árvore com lock global.

Implemente AVL pelo menos uma vez para entender rotações; em produção, prefira a biblioteca. Red-Black é mais difícil de depurar, mas o custo amortizado de escrita costuma vencer.

## Armadilhas comuns

- Esquecer de atualizar alturas após rotação.
- Comparar com `==` em vez de `compareTo`.
- Remoção sem rebalancear (o caso mais esquecido).
- Usar árvore balanceada para dados que só precisam de hash.
- Iterar e modificar a árvore ao mesmo tempo.

## Checklist de domínio

- [ ] Explico as quatro rotações AVL.
- [ ] Sei as invariantes Red-Black.
- [ ] Implemento busca, inserção e remoção balanceadas.
- [ ] Conheço `TreeMap` e `ConcurrentSkipListMap`.
- [ ] Meço altura e latência com dados ordenados.

## Para ir além

Leia o capítulo de árvores balanceadas em visualgo.net e o código-fonte de `java.util.TreeMap`. Depois insira 10 mil chaves ordenadas em uma BST e em uma AVL e compare a altura.
