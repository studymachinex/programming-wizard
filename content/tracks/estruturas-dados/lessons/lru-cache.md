> **Em uma frase:** um LRU cache une um HashMap, que encontra o nó em O(1), a uma lista duplamente ligada, que reordena a recência em O(1) — nenhuma das duas estruturas sozinha entrega as duas operações.

## O problema

Um serviço consulta um catálogo externo que leva 40 ms por chamada. A maioria das requisições pede os mesmos produtos, então um cache reduz a latência para microssegundos. O problema é o limite de memória: quando o cache enche, alguma entrada precisa sair. A política LRU (*least recently used*) descarta a entrada cujo último acesso é mais antigo, porque a chance de ela ser pedida de novo é menor que a das recentes.

A implementação ingênua guarda um timestamp por chave e, ao encher, varre o mapa inteiro para achar o menor — O(n) por evicção. Uma lista ordenada por acesso também não resolve: mover um item ao topo custa O(n) sem referências para os vizinhos. O requisito de `get` e `put` em O(1) exige combinar duas estruturas.

## Como funciona

O `HashMap<K, Node>` responde "onde está o nó desta chave?" em O(1) esperado. A lista duplamente ligada mantém a ordem de recência: a cabeça é o item mais recente, a cauda é o menos recente. Cada nó tem `chave`, `valor`, `anterior` e `proximo`. Com sentinelas nas duas pontas, inserir e remover nunca precisam tratar `null` como caso especial.

| Operação | HashMap | Lista | Total |
|---|---|---|---|
| `get` com hit | O(1) | O(1) para mover ao topo | O(1) esperado |
| `put` de chave existente | O(1) | O(1) para mover ao topo | O(1) esperado |
| `put` de chave nova | O(1) | O(1) para inserir e evictar | O(1) esperado |
| `remove` | O(1) | O(1) com o nó em mãos | O(1) esperado |

O ponto sutil é que o mapa guarda o **nó**, não o valor. Se guardasse só o valor, ao remover a cauda você teria que procurar a chave correspondente na lista. Com o nó, a evicção é `cauda.anterior`, e você remove a chave dele do mapa em O(1).

```java
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public class LruCache<K, V> {

    private static final class Node<K, V> {
        final K chave;
        V valor;
        Node<K, V> anterior;
        Node<K, V> proximo;

        Node(K chave, V valor) {
            this.chave = chave;
            this.valor = valor;
        }
    }

    private final int capacidade;
    private final Map<K, Node<K, V>> indice = new HashMap<>();
    private final Node<K, V> cabeca = new Node<>(null, null); // mais recente
    private final Node<K, V> cauda = new Node<>(null, null);  // menos recente

    public LruCache(int capacidade) {
        if (capacidade <= 0) {
            throw new IllegalArgumentException("capacidade deve ser > 0");
        }
        this.capacidade = capacidade;
        cabeca.proximo = cauda;
        cauda.anterior = cabeca;
    }

    public V get(K chave) {
        Node<K, V> no = indice.get(chave);
        if (no == null) {
            return null;
        }
        moverParaFrente(no);
        return no.valor;
    }

    public void put(K chave, V valor) {
        Objects.requireNonNull(chave, "chave nula não suportada");
        Node<K, V> existente = indice.get(chave);
        if (existente != null) {
            existente.valor = valor;
            moverParaFrente(existente);
            return;
        }
        if (indice.size() == capacidade) {
            Node<K, V> vitima = cauda.anterior;
            desconectar(vitima);
            indice.remove(vitima.chave);
        }
        Node<K, V> novo = new Node<>(chave, valor);
        indice.put(chave, novo);
        inserirNaFrente(novo);
    }

    public V remove(K chave) {
        Node<K, V> no = indice.remove(chave);
        if (no == null) {
            return null;
        }
        desconectar(no);
        return no.valor;
    }

    public int size() {
        return indice.size();
    }

    private void moverParaFrente(Node<K, V> no) {
        desconectar(no);
        inserirNaFrente(no);
    }

    private void desconectar(Node<K, V> no) {
        no.anterior.proximo = no.proximo;
        no.proximo.anterior = no.anterior;
        no.anterior = null;
        no.proximo = null;
    }

    private void inserirNaFrente(Node<K, V> no) {
        no.proximo = cabeca.proximo;
        no.anterior = cabeca;
        cabeca.proximo.anterior = no;
        cabeca.proximo = no;
    }
}
```

A ordem das atualizações em `inserirNaFrente` importa: conecte o novo nó ao antigo primeiro e só depois ajuste `cabeca.proximo`. Se começar por `cabeca.proximo = no`, perde a referência ao primeiro nó real e a lista se rompe. O mesmo vale em `desconectar`: atualize os dois vizinhos antes de anular os ponteiros do nó removido.

```java
public class DemoLru {

    public static void main(String[] args) {
        LruCache<Integer, String> cache = new LruCache<>(2);
        cache.put(1, "um");
        cache.put(2, "dois");
        System.out.println(cache.get(1));  // um: 1 vira o mais recente

        cache.put(3, "três");              // remove 2
        System.out.println(cache.get(2));  // null
        System.out.println(cache.get(3));  // três
    }
}
```

## Na prática

`LinkedHashMap` já implementa essa combinação com `accessOrder = true` e `removeEldestEntry` sobrescrito. Mas ele não é thread-safe: `get` altera a lista internamente e pode corromper a estrutura sob concorrência. `Collections.synchronizedMap` serializa todas as operações; `ConcurrentHashMap` não serve porque não mantém ordem de recência. Para cargas altas, Caffeine usa Window TinyLFU, que combina frequência e janela LRU para resistir a varreduras.

Cada entrada ocupa ~64 bytes entre nó, entrada do mapa e slot. Para 10 mil entradas, menos de 1 MB; para 10 milhões, ~700 MB. Dimensione o cache pelo orçamento de memória e pelo hit rate desejado.

## Armadilhas comuns

- **Remover da lista e esquecer o mapa.** A chave continua no índice apontando para um nó órfão; o próximo `get` ressuscita o valor ou corrompe a lista.
- **Não mover o nó no `get`.** Sem isso, a política vira FIFO e o hit rate cai.
- **Evictar depois de inserir.** Com capacidade cheia, você ultrapassa o limite por um instante.
- **Ignorar concorrência.** `put` e `get` simultâneos podem criar ciclos. Use lock ou uma biblioteca testada.

## Para ir além

- [Oracle — LinkedHashMap (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/LinkedHashMap.html): modo access-order e `removeEldestEntry`.
- [LeetCode — LRU Cache](https://leetcode.com/problems/lru-cache/): o enunciado clássico com testes de borda.
- [Oracle — HashMap (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html): custo esperado e notas de implementação.
