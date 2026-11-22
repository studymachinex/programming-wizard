> **Em uma frase:** um HashMap é um array de buckets, uma função que distribui chaves entre eles e uma lista (ou árvore) por bucket para resolver colisões.

## O problema

A aula anterior explicou o contrato; agora você vai implementar. Escrever um HashMap do zero é o exercício que mais expõe lacunas: muita gente sabe usar `get`/`put`, mas trava no resize, na remoção em cadeia e na diferença entre comparar `hash` e comparar `equals`. São exatamente esses detalhes que aparecem em entrevistas e em bugs de produção com chaves que "desaparecem".

A implementação abaixo é didática, mas toma as mesmas decisões estruturais da JDK: capacidade potência de dois, índice por máscara, encadeamento separado, resize por dobra e fator de carga 0,75. Ela não é thread-safe, não aceita `null` e não treeifica cadeias longas — três omissões conscientes que você deve saber explicar.

## Como funciona

O estado mínimo é `Node<K,V>[] buckets` e `int size`. Cada nó guarda `hash`, `key`, `value` e `next`. Guardar o hash evita recalcular `key.hashCode()` a cada comparação e permite comparar primeiro o inteiro (barato) antes de chamar `equals` (potencialmente caro).

As operações seguem sempre o mesmo esqueleto:

1. Calcule `h = spread(key.hashCode())`.
2. Calcule `idx = h & (buckets.length - 1)`.
3. Percorra a cadeia do bucket comparando `hash` e `equals`.
4. Se achou, atualize o valor; se não, insira no início da cadeia.
5. Se `size > capacity * 0.75`, dobre a capacidade e rehash.

Inserir no início é O(1) e não exige percorrer a cadeia; a ordem dentro do bucket não importa. O resize percorre todos os nós e os redistribui. Como a capacidade dobra, cada nó ou fica no mesmo índice ou vai para `índice + capacidadeAntiga`, o que torna o rehash mais barato do que recalcular tudo do zero — mas a implementação simples abaixo recalcula, o que é aceitável para entender.

```java
import java.util.Objects;

public class SimpleHashMap<K, V> {

    private static final class Node<K, V> {
        final int hash;
        final K key;
        V value;
        Node<K, V> next;

        Node(int hash, K key, V value, Node<K, V> next) {
            this.hash = hash;
            this.key = key;
            this.value = value;
            this.next = next;
        }
    }

    private static final int CAPACIDADE_INICIAL = 16;
    private static final double FATOR_CARGA = 0.75;

    @SuppressWarnings("unchecked")
    private Node<K, V>[] buckets = (Node<K, V>[]) new Node[CAPACIDADE_INICIAL];
    private int size;

    private static int spread(int h) {
        return h ^ (h >>> 16);
    }

    private int indice(int hash) {
        return hash & (buckets.length - 1);
    }

    public int size() {
        return size;
    }

    public V get(K key) {
        Objects.requireNonNull(key, "chave nula não suportada");
        int hash = spread(key.hashCode());
        for (Node<K, V> n = buckets[indice(hash)]; n != null; n = n.next) {
            if (n.hash == hash && Objects.equals(n.key, key)) {
                return n.value;
            }
        }
        return null;
    }

    public V put(K key, V value) {
        Objects.requireNonNull(key, "chave nula não suportada");
        int hash = spread(key.hashCode());
        int i = indice(hash);
        for (Node<K, V> n = buckets[i]; n != null; n = n.next) {
            if (n.hash == hash && Objects.equals(n.key, key)) {
                V antigo = n.value;
                n.value = value;
                return antigo;
            }
        }
        buckets[i] = new Node<>(hash, key, value, buckets[i]);
        size++;
        if (size > buckets.length * FATOR_CARGA) {
            resize();
        }
        return null;
    }

    public V remove(K key) {
        Objects.requireNonNull(key, "chave nula não suportada");
        int hash = spread(key.hashCode());
        int i = indice(hash);
        Node<K, V> anterior = null;
        for (Node<K, V> n = buckets[i]; n != null; n = n.next) {
            if (n.hash == hash && Objects.equals(n.key, key)) {
                if (anterior == null) {
                    buckets[i] = n.next;
                } else {
                    anterior.next = n.next;
                }
                n.next = null; // ajuda o GC
                size--;
                return n.value;
            }
            anterior = n;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private void resize() {
        Node<K, V>[] antigos = buckets;
        buckets = (Node<K, V>[]) new Node[antigos.length * 2];
        size = 0;
        for (Node<K, V> cabeca : antigos) {
            for (Node<K, V> n = cabeca; n != null; ) {
                Node<K, V> proximo = n.next; // salva antes de reinserir
                n.next = null;
                reinserir(n);
                n = proximo;
            }
        }
    }

    private void reinserir(Node<K, V> n) {
        int i = indice(n.hash);
        n.next = buckets[i];
        buckets[i] = n;
        size++;
    }
}
```

A remoção é o método mais fácil de errar. Você precisa manter `anterior` e religar `anterior.next = n.next`; se o nó for a cabeça do bucket, atualize `buckets[i]`. Esquecer esse caso faz a chave continuar sendo encontrada depois do remove. Anular `n.next` é defesa contra uso após remoção e ajuda o GC em cargas grandes.

## Na prática

O resize é o ponto de inflexão. Sem ele, as cadeias crescem e o mapa degenera para O(n). Com ele, o custo amortizado por put continua O(1). O código abaixo exercita colisões e resize e mostra que a chave continua acessível depois de várias redistribuições.

```java
public class DemoMapa {

    public static void main(String[] args) {
        SimpleHashMap<String, Integer> mapa = new SimpleHashMap<>();
        mapa.put("Aa", 1);
        mapa.put("BB", 2); // mesmo hashCode de "Aa", bucket diferente? mesmo bucket
        System.out.println(mapa.get("Aa")); // 1
        System.out.println(mapa.get("BB")); // 2
        System.out.println(mapa.size());    // 2

        mapa.put("Aa", 10); // atualiza, não duplica
        System.out.println(mapa.get("Aa")); // 10
        System.out.println(mapa.size());    // 2

        System.out.println(mapa.remove("BB")); // 2
        System.out.println(mapa.get("BB"));    // null
        System.out.println(mapa.size());       // 1

        // Força vários resizes: 16 -> 32 -> 64 -> 128.
        for (int i = 0; i < 200; i++) {
            mapa.put("chave-" + i, i);
        }
        System.out.println(mapa.size());       // 201
        System.out.println(mapa.get("chave-199")); // 199
    }
}
```

Colisões são normais e não indicam erro. "Aa" e "BB" têm o mesmo hash, mas `equals` os distingue; a cadeia do bucket guarda os dois. O que degrada o desempenho é uma função que concentra muitas chaves no mesmo índice. Em uma implementação de produção, você adicionaria treeificação quando a cadeia passasse de 8 nós e a capacidade fosse pelo menos 64, como a JDK faz, para limitar o pior caso a O(log n) por bucket.

Três decisões que você deve saber justificar:

- **Capacidade potência de dois:** permite `hash & (n-1)` em vez de `%`, e o resize divide cada cadeia em no máximo duas. O custo é que os bits altos precisam ser espalhados, daí o `h ^ (h >>> 16)`.
- **Fator 0,75:** compromisso entre memória e colisões. Menor (0,5) reduz colisões e acelera buscas, mas desperdiça ~50% dos buckets; maior (0,9) economiza memória e aumenta cadeias.
- **Encadeamento separado:** simples de remover e de redimensionar. Open addressing (linear probing) tem melhor localidade, mas exige cuidado com tombstones e clustering; é a escolha de `ThreadLocal` e de alguns mapas especializados.

## Armadilhas comuns

- **Esquecer o caso de remover a cabeça do bucket.** Sem atualizar `buckets[i]`, a entrada continua na cadeia.
- **Reinserir sem salvar `next`.** No resize, sobrescrever `n.next` antes de guardar o próximo trunca a cadeia e perde chaves.
- **Comparar só `hash`.** Hashes iguais não significam chaves iguais; sempre confirme com `equals`.
- **Deixar `size` errado após resize.** Se você zera o contador, some com o tamanho; se não zera, conta duas vezes. Escolha uma estratégia e teste `size()` após cada operação.
- **Aceitar `null` sem tratar.** `key.hashCode()` estoura. Se quiser suportar null, use um bucket especial para índice 0, como a JDK.

## Para ir além

- [OpenJDK — HashMap](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/HashMap.java): `putVal`, `resize` e `treeifyBin`.
- [Oracle — HashMap (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html): especificação e notas de implementação.
- [LeetCode — Design HashMap](https://leetcode.com/problems/design-hashmap/): pratique a implementação com testes.
