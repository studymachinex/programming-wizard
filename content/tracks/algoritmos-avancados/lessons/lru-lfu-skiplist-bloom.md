> **Em uma frase:** LRU, LFU, skip list e Bloom filter são estruturas de cache e índice com trade-offs de memória, precisão e ordem — não são intercambiáveis.

Um cache precisa decidir quem sai. LRU usa recência; LFU usa frequência; skip list mantém ordem probabilística; Bloom filter responde "provavelmente sim" com espaço mínimo. Cada uma resolve um problema diferente.

## O problema

Um cache de API com 10 GB recebe milhões de chaves. LRU é simples, mas uma varredura única expulsa o que é usado sempre. LFU protege frequentes, mas envelhece mal. Um filtro de existência precisa de 1 bit por item, não de um set gigante.

## Como funciona

**LRU:** HashMap + lista duplamente ligada. `get` move para a frente; `put` remove o último.

```java
class Lru<K, V> {
    private final int cap;
    private final Map<K, Node<K, V>> mapa = new HashMap<>();
    private final Node<K, V> head = new Node<>(null, null), tail = new Node<>(null, null);

    Lru(int cap) {
        this.cap = cap;
        head.next = tail;
        tail.prev = head;
    }

    V get(K k) {
        var n = mapa.get(k);
        if (n == null) return null;
        moverParaFrente(n);
        return n.valor;
    }

    void put(K k, V v) {
        var n = mapa.get(k);
        if (n != null) { n.valor = v; moverParaFrente(n); return; }
        if (mapa.size() == cap) {
            var ultimo = tail.prev;
            remover(ultimo);
            mapa.remove(ultimo.chave);
        }
        var novo = new Node<>(k, v);
        mapa.put(k, novo);
        inserirNaFrente(novo);
    }
    // moverParaFrente, inserirNaFrente, remover...
}
```

**LFU:** frequência + lista de recência por frequência. Mais complexo; use `LinkedHashSet` por bucket.

**Skip list:** lista com níveis aleatórios; busca O(log n) esperado, usada por `ConcurrentSkipListMap`.

**Bloom filter:** bits + hashes. Falso positivo possível, falso negativo não. Não remove com segurança.

## Na prática

LRU para cache de página e API; LFU para conteúdo popular; skip list para índice concorrente e ordenado; Bloom para evitar lookups inexistentes (cache penetration).

Em Java, `LinkedHashMap` com `accessOrder=true` e `removeEldestEntry` implementa LRU simples. Para concorrência, `ConcurrentHashMap` + lock ou Caffeine.

## Armadilhas comuns

- LRU com `get` que não atualiza recência.
- LFU sem decaimento: itens antigos dominam.
- Bloom filter achando que é exato.
- Skip list com nível máximo baixo.
- Cache sem métrica de hit ratio.

## Checklist de domínio

- [ ] Implemento LRU do zero.
- [ ] Explico LFU e seu envelhecimento.
- [ ] Sei a garantia do Bloom filter.
- [ ] Entendo skip list e concorrência.
- [ ] Escolho por acesso e memória.

## Para ir além

Leia sobre Caffeine e a documentação de `ConcurrentSkipListMap`. Depois implemente LRU e LFU e compare hit ratio em uma trace real.
