> **Em uma frase:** a BST troca a busca linear por decisões binárias — desde que a invariante de ordem sobreviva a toda inserção e remoção.

## O problema

Um índice em memória precisa responder "existe a chave 42?" e listar as chaves em ordem. Um array ordenado busca em O(log n), mas inserir no meio custa O(n). Uma lista ligada insere em O(1), mas busca em O(n). A árvore binária de busca (BST) promete busca, inserção e remoção em O(log n) no caso médio, mais percurso ordenado em O(n).

O preço é uma invariante que vale em todos os nós: tudo à esquerda é menor, tudo à direita é maior. A estrutura degenera quando você insere dados já ordenados ou remove sempre pelo mesmo lado.

## Como funciona

Cada nó guarda chave, valor e duas referências. A busca compara a chave com o nó atual e desce à esquerda ou à direita, descartando metade da subárvore. A altura `h` define o custo: busca, inserção e remoção são O(h); percurso completo é O(n). Numa árvore balanceada, `h ≈ log₂ n`; numa aleatória, a altura esperada é ~4,31 ln n — cerca de 60 para 1 milhão de nós. Inserindo 1, 2, 3, ..., n, cada novo nó vira filho direito do anterior e `h = n - 1`.

| Operação | Balanceada | Aleatória | Pior caso |
|---|---|---|---|
| `buscar` | O(log n) | O(log n) esperado | O(n) |
| `inserir` | O(log n) | O(log n) esperado | O(n) |
| `remover` | O(log n) | O(log n) esperado | O(n) |
| `emOrdem` | O(n) | O(n) | O(n) |

A remoção tem três casos. Sem filho esquerdo, o direito sobe; sem filho direito, o esquerdo sobe; com dois filhos, você substitui a chave pelo **sucessor** (o mínimo da subárvore direita) e remove o sucessor da posição antiga, preservando a ordem dos descendentes.

```java
public class Bst {

    private static final class No {
        int chave;
        String valor;
        No esquerda;
        No direita;

        No(int chave, String valor) {
            this.chave = chave;
            this.valor = valor;
        }
    }

    private No raiz;

    public void inserir(int chave, String valor) {
        raiz = inserir(raiz, chave, valor);
    }

    private No inserir(No no, int chave, String valor) {
        if (no == null) {
            return new No(chave, valor);
        }
        if (chave < no.chave) {
            no.esquerda = inserir(no.esquerda, chave, valor);
        } else if (chave > no.chave) {
            no.direita = inserir(no.direita, chave, valor);
        } else {
            no.valor = valor; // chave duplicada: atualiza o valor
        }
        return no;
    }

    public String buscar(int chave) {
        No atual = raiz;
        while (atual != null) {
            if (chave == atual.chave) {
                return atual.valor;
            }
            atual = chave < atual.chave ? atual.esquerda : atual.direita;
        }
        return null;
    }

    public void remover(int chave) {
        raiz = remover(raiz, chave);
    }

    private No remover(No no, int chave) {
        if (no == null) {
            return null;
        }
        if (chave < no.chave) {
            no.esquerda = remover(no.esquerda, chave);
        } else if (chave > no.chave) {
            no.direita = remover(no.direita, chave);
        } else {
            if (no.esquerda == null) {
                return no.direita;
            }
            if (no.direita == null) {
                return no.esquerda;
            }
            No sucessor = minimo(no.direita);
            no.chave = sucessor.chave; // copia chave e valor, não o nó
            no.valor = sucessor.valor;
            no.direita = remover(no.direita, sucessor.chave);
        }
        return no;
    }

    private No minimo(No no) {
        while (no.esquerda != null) {
            no = no.esquerda;
        }
        return no;
    }

    public int altura() {
        return altura(raiz);
    }

    private int altura(No no) {
        if (no == null) {
            return -1;
        }
        return 1 + Math.max(altura(no.esquerda), altura(no.direita));
    }
}
```

Validar uma BST exige propagar limites mínimos e máximos; comparar cada nó apenas com os filhos imediatos aceita árvores inválidas. O percurso em ordem, por outro lado, deve produzir uma sequência estritamente crescente.

```java
public class DemoBst {

    public static void main(String[] args) {
        Bst bst = new Bst();
        for (int chave : new int[]{4, 2, 6, 1, 3, 5, 7}) {
            bst.inserir(chave, "v" + chave);
        }
        System.out.println(bst.buscar(3));   // v3
        System.out.println(bst.altura());    // 2

        bst.remover(2);                      // dois filhos: sucessor 3 assume
        System.out.println(bst.buscar(3));   // v3

        Bst degenerada = new Bst();
        for (int i = 1; i <= 7; i++) {
            degenerada.inserir(i, "v" + i);
        }
        System.out.println(degenerada.altura()); // 6
    }
}
```

## Na prática

Use BST quando o requisito inclui ordem: menor/maior, piso/teto, "todas as chaves entre A e B", iteração ordenada. Se você só precisa de busca por igualdade, `HashMap` é mais rápido e mais simples. Para dados duráveis, o banco usa B-tree, a generalização da BST para páginas de disco com fanout alto: uma página de 8 KB cabe centenas de chaves e mantém a altura em 3 ou 4 níveis.

A BST simples é aceitável com dados aleatórios e volume moderado. Com dados ordenados, use `TreeMap` ou embaralhe antes. A remoção de Hibbard, que sempre usa o sucessor, tem um efeito colateral conhecido: após muitas inserções e remoções aleatórias, a altura tende a O(√n).

## Armadilhas comuns

- **Esquecer a subárvore do sucessor.** Ao remover o mínimo da direita, religue `no.direita` ao resultado; caso contrário, perde nós.
- **Inserir dados ordenados.** A altura vira n e a busca degrada para O(n); a recursão pode estourar a pilha antes disso.
- **Usar `==` para comparar objetos.** `Integer` acima de 127 não é idêntico; em chaves genéricas, use `compareTo` ou `equals`.

## Checklist de domínio

- [ ] Você implementa `inserir`, `buscar` e `remover` do zero
- [ ] Você trata os três casos de remoção sem perder subárvores
- [ ] Você explica por que a altura é O(n) no pior caso e ~O(log n) no caso médio
- [ ] Você valida uma BST com limites, não apenas com os filhos imediatos
- [ ] Você escolhe entre BST, `HashMap` e `TreeMap` por requisito

## Para ir além

- [LeetCode — Validate Binary Search Tree](https://leetcode.com/problems/validate-binary-search-tree/): teste a validação por intervalos.
- [LeetCode — Delete Node in a BST](https://leetcode.com/problems/delete-node-in-a-bst/): pratique os três casos de remoção.
- [Oracle — TreeMap (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/TreeMap.html): a versão balanceada pronta para produção.
