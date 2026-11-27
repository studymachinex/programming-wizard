> **Em uma frase:** um cache LRU de machine coding é HashMap mais lista duplamente ligada, como no LeetCode, acrescido de genéricos, um ponto de extensão na eviction e métricas que provam que ele funciona.

## O problema

Você já resolveu o LRU Cache do LeetCode. Na rodada de machine coding, o enunciado é parecido, mas o entrevistador olha outras coisas: o cache é genérico ou só aceita `int`? O que acontece com o objeto despejado: alguém precisa fechar uma conexão, gravar em disco, emitir métrica? Como se sabe se o cache está ajudando? Um cache com hit rate de 3% só gasta memória e esconde bugs de consistência.

A segunda pergunta é a do follow-up clássico: "e se eu quiser trocar LRU por LFU?". Se a política estiver espalhada pelo `get` e pelo `put`, a resposta é "reescrevo tudo".

## Como funciona

A estrutura é a mesma do LeetCode, e é bom dizer isso em voz alta para ganhar tempo: o `HashMap<K, No>` acha o nó em O(1), e a lista duplamente ligada mantém a ordem de uso, com o mais recente na frente e o menos recente atrás. Mover um nó para a frente e tirar o último custam O(1) porque o nó conhece os vizinhos.

Dois **nós sentinela** (cabeça e cauda) eliminam todos os `if (head == null)` e `if (no == tail)`, que são onde nascem os bugs em código escrito sob pressão.

```java
import java.util.*;

class LruCache<K, V> {
    interface EvictionListener<K, V> { void onEvict(K chave, V valor); }

    private final class No { K chave; V valor; No ant, prox; No(K k, V v) { chave = k; valor = v; } }

    private final int capacidade;
    private final EvictionListener<K, V> listener;
    private final Map<K, No> indice = new HashMap<>();
    private final No cabeca = new No(null, null), cauda = new No(null, null);
    private long hits, misses, evictions;

    LruCache(int capacidade, EvictionListener<K, V> listener) {
        this.capacidade = capacidade;
        this.listener = listener == null ? (k, v) -> {} : listener;
        cabeca.prox = cauda;
        cauda.ant = cabeca;
    }

    private void desligar(No n) { n.ant.prox = n.prox; n.prox.ant = n.ant; }

    private void naFrente(No n) {
        n.prox = cabeca.prox; n.ant = cabeca;
        cabeca.prox.ant = n; cabeca.prox = n;
    }
}
```

### A ordem das operações no put importa

Quando a chave nova estoura a capacidade, há quatro passos: desligar o último nó, tirá-lo do índice, contar a eviction e chamar o listener. **O listener vem por último.** Ele é código de terceiros: pode lançar exceção, pode demorar e pode até chamar o cache de volta. Se ele rodar antes de o estado estar consistente, uma exceção deixa o índice apontando para um nó que já não está na lista.

```java
void put(K chave, V valor) {
    No n = indice.get(chave);
    if (n != null) { n.valor = valor; desligar(n); naFrente(n); return; }
    n = new No(chave, valor);
    indice.put(chave, n);
    naFrente(n);
    if (indice.size() > capacidade) {
        No lru = cauda.ant;
        desligar(lru);
        indice.remove(lru.chave);
        evictions++;
        listener.onEvict(lru.chave, lru.valor); // estado já consistente
    }
}

double hitRate() {
    long total = hits + misses;
    return total == 0 ? 0 : (double) hits / total;
}
```

## Na prática

- **Por que não `LinkedHashMap`?** Em produção, ele resolve com `accessOrder = true` e `removeEldestEntry`. Na entrevista, comece dizendo que usaria isso no trabalho e pergunte se pode. Quase sempre a resposta é "implemente a lista". Saber das duas coisas conta pontos.
- **Trocar a política.** Para LFU, a estrutura muda: um mapa de frequência para uma lista de nós, mais um ponteiro para a menor frequência, ainda em O(1). Se o entrevistador pedir políticas plugáveis, extraia uma interface `PoliticaEviction<K>` com `acessou(K)`, `inseriu(K)`, `removeu(K)` e `vitima()`, e faça o cache só orquestrar.
- **Métricas.** Hits, misses e evictions são o mínimo. Se a taxa de evictions for alta com hit rate baixo, o cache está pequeno demais ou a carga não tem localidade. Caffeine e Guava expõem exatamente esses números (`CacheStats`).
- **Produção de verdade.** O Caffeine usa W-TinyLFU, que combina recência e frequência e resiste a varreduras (um `SELECT *` não expulsa todos os dados quentes). Citar isso mostra repertório, mas não implemente na entrevista.

## Armadilhas comuns

- **`put` de chave existente contando como eviction ou não promovendo.** Atualizar o valor também é um uso: a chave vai para a frente.
- **`remove` chamando o listener.** Remoção explícita não é eviction. Misturar as duas faz o listener gravar em disco algo que o usuário apagou de propósito.
- **Esquecer o `indice.remove` na eviction.** O tamanho do mapa nunca cai, e o cache passa a despejar a cada `put`.
- **Thread safety por acidente.** `get` muda a lista, então até leituras precisam de lock. Um `synchronized` em tudo é aceitável para começar, e a aula de concorrência discute alternativas.

## Checklist de domínio

- [ ] Você escreve o LRU genérico com sentinelas em menos de 15 minutos
- [ ] Você explica por que o listener roda depois de o estado estar consistente
- [ ] Você diferencia remoção explícita de eviction nas métricas e no listener
- [ ] Você descreve como a estrutura muda para LFU

## Para ir além

- [LeetCode 146: LRU Cache](https://leetcode.com/problems/lru-cache/): a versão algorítmica, para treinar velocidade.
- [Caffeine: Efficiency (W-TinyLFU)](https://github.com/ben-manes/caffeine/wiki/Efficiency): por que LRU puro perde para políticas adaptativas.
- [Javadoc de LinkedHashMap (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/LinkedHashMap.html): `accessOrder` e `removeEldestEntry`.
