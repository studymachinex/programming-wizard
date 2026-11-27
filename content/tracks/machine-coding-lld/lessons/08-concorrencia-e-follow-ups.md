> **Em uma frase:** quase toda rodada de machine coding termina com "e se várias threads chamarem isso ao mesmo tempo?", e a boa resposta escolhe a granularidade do lock pelo invariante que precisa ser protegido.

## O problema

Seu KV store, seu cache e seu estacionamento passaram nos testes. Faltam 12 minutos, e o entrevistador pergunta: "agora é um servidor com 200 threads. O que quebra?". Responder "troco `HashMap` por `ConcurrentHashMap`" é a resposta incompleta mais comum. Ela evita corromper o mapa, mas não protege invariantes que envolvem **mais de uma estrutura** ou **mais de uma operação**.

## Como funciona

### 1. Encontre o invariante

Para cada classe, pergunte o que precisa ser verdade o tempo todo:

| Classe | Invariante | Estruturas envolvidas |
|---|---|---|
| Cache LRU | Todo nó do índice está na lista, e vice-versa | `HashMap` + lista ligada |
| Estacionamento | Uma vaga tem no máximo um ticket ativo | `TreeSet` de livres + mapas de tickets |
| Token bucket | Tokens nunca ficam negativos | Um balde por cliente |
| Splitwise | A soma dos saldos do grupo é zero | Saldos do grupo |

Se o invariante envolve duas estruturas, `ConcurrentHashMap` sozinho não basta: entre o `put` no índice e o `naFrente` na lista, outra thread vê um estado inconsistente.

### 2. Escolha a granularidade

| Estratégia | Quando usar | Custo |
|---|---|---|
| Um lock para o objeto inteiro | Primeiro passo, operações curtas | Contenção alta com muitas threads |
| Lock por chave ou por partição | Invariante local à chave (balde por cliente) | Mais memória, risco de deadlock se travar duas chaves |
| Estrutura concorrente com operação atômica | A estrutura já oferece a operação composta | Só serve se a operação existir |
| Thread única com fila (actor) | Estado complexo e ordem importa | Latência da fila, um núcleo de CPU |

No token bucket, o invariante é por cliente. O `compute` do `ConcurrentHashMap` roda atomicamente **por chave**, sem lock global, e clientes diferentes não disputam entre si:

```java
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

class TokenBucketConcorrente {
    private record Balde(double tokens, long ultima, boolean aceitou) {}

    private final ConcurrentHashMap<String, Balde> baldes = new ConcurrentHashMap<>();
    private final int capacidade;
    private final double porSegundo;
    private final LongSupplier relogio;

    TokenBucketConcorrente(int capacidade, double porSegundo, LongSupplier relogio) {
        this.capacidade = capacidade; this.porSegundo = porSegundo; this.relogio = relogio;
    }

    boolean allow(String id) {
        long agora = relogio.getAsLong();
        Balde b = baldes.compute(id, (k, atual) -> {   // atômico por chave
            double tokens = atual == null ? capacidade
                    : Math.min(capacidade, atual.tokens() + Math.max(0, agora - atual.ultima()) * porSegundo / 1000.0);
            long ultima = atual == null ? agora : Math.max(atual.ultima(), agora);
            return tokens >= 1 ? new Balde(tokens - 1, ultima, true) : new Balde(tokens, ultima, false);
        });
        return b.aceitou();
    }
}
```

Os registros imutáveis tornam o `compute` seguro: a função não muta nada compartilhado, só devolve o próximo estado.

### 3. Leituras também escrevem

No LRU, `get` move o nó para a frente, então até leitura precisa de exclusão mútua. Um `ReadWriteLock` não ajuda aqui, porque não existe leitura pura. As saídas reais são um lock único (simples e correto) ou **striping**: N caches LRU independentes, com a chave escolhendo o segmento por `hash % N`. A recência deixa de ser global e passa a valer por segmento, uma troca aceitável que o Guava Cache fazia.

```java
import java.util.*;

class LruParticionado<K, V> {
    private final List<Map<K, V>> segmentos = new ArrayList<>();

    LruParticionado(int capacidadeTotal, int nSegmentos) {
        int porSegmento = Math.max(1, capacidadeTotal / nSegmentos);
        for (int i = 0; i < nSegmentos; i++) {
            segmentos.add(Collections.synchronizedMap(new LinkedHashMap<>(16, 0.75f, true) {
                @Override protected boolean removeEldestEntry(Map.Entry<K, V> e) { return size() > porSegmento; }
            }));
        }
    }

    private Map<K, V> segmento(K chave) {
        return segmentos.get(Math.floorMod(chave.hashCode(), segmentos.size()));
    }

    V get(K chave) { return segmento(chave).get(chave); }
    void put(K chave, V valor) { segmento(chave).put(chave, valor); }
}
```

## Na prática

- **Comece com o lock único e diga o porquê.** "Correto primeiro. Se o profiling mostrar contenção, particiono." Isso soa sênior. Otimizar sem medir soa júnior.
- **Estacionamento com várias cancelas.** `ConcurrentSkipListSet.pollFirst()` é atômico: duas cancelas nunca recebem a mesma vaga. Mas o par "tirar vaga e registrar placa" ainda precisa ser atômico contra a mesma placa em duas cancelas, e `ConcurrentHashMap.putIfAbsent(placa, ...)` antes de alocar resolve.
- **Deadlock.** Se uma operação precisa de dois locks (transferência entre dois saldos), adquira sempre em ordem fixa, por exemplo pelo id menor primeiro.
- **Virtual threads (Java 21).** Mudam o custo de bloquear, não a necessidade de sincronizar. E `synchronized` com I/O dentro prendia a virtual thread ao carrier até o Java 24, o que vale citar.
- **Teste de concorrência.** Um `ExecutorService` com 16 threads, um `CountDownLatch` para largar todas juntas e uma asserção no invariante (soma zero, nenhuma vaga duplicada). Não prova ausência de bug, mas pega os grosseiros.

## Armadilhas comuns

- **`ConcurrentHashMap` com check-then-act.** `if (!map.containsKey(k)) map.put(k, v)` continua com corrida. Use `putIfAbsent`, `computeIfAbsent` ou `compute`.
- **Chamar código de terceiros segurando o lock.** O listener de eviction ou o appender rodando dentro do `synchronized` pode travar tudo ou causar deadlock. Colete o que for preciso e chame fora do lock.
- **`volatile` como solução universal.** `volatile` dá visibilidade, mas não atomicidade: `contador++` num campo volátil perde incrementos.

## Checklist de domínio

- [ ] Você identifica o invariante de cada classe antes de escolher o lock
- [ ] Você usa `compute` para estado por chave sem lock global
- [ ] Você explica por que um LRU não se beneficia de `ReadWriteLock`
- [ ] Você escreve um teste que larga N threads juntas e confere o invariante

## Para ir além

- [Javadoc de ConcurrentHashMap.compute (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html#compute(K,java.util.function.BiFunction)): a garantia de atomicidade por chave.
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491): o fim do pinning com `synchronized`.
- [Java Concurrency in Practice, de Brian Goetz](https://jcip.net/): os capítulos sobre invariantes e composição de objetos thread-safe.
