> **Em uma frase:** contenção não se resolve com mais locks — resolve-se reduzindo a região crítica, o número de threads ou a frequência com que elas disputam a mesma linha de cache.

`synchronized` é correto, mas pode ser caro sob carga. Quando 200 threads disputam um único monitor, o tempo vai para despertar, bloquear e trocar de contexto. A saída é escolher a primitiva certa e, principalmente, desenhar para não disputar.

## O problema

Um contador global incrementado por todas as requisições vira ponto de serialização. Trocar `synchronized` por `AtomicLong` melhora, mas ainda há uma única linha de cache sendo atualizada por todos os núcleos — o famoso *false sharing* e o ping-pong de cache. Em cargas altas, `LongAdder` vence com folga porque distribui as células.

## Como funciona

| Primitiva | Garantia | Custo típico |
|---|---|---|
| `synchronized` | Exclusão mútua, visibilidade | Bloqueio, possível inflation |
| `ReentrantLock` | Igual + `tryLock`, fairness, interrupção | Igual, mais flexível |
| `ReadWriteLock` | Muitos leitores ou um escritor | Pode ser pior se leitura é curta |
| `StampedLock` | Leitura otimista | Complexo, não reentrante |
| `AtomicLong` | CAS | Retry sob contenção |
| `LongAdder` | Soma distribuída | Leitura não é instantânea |

`ReentrantLock` permite tentar sem bloquear, com timeout:

```java
class Estoque {
    private final ReentrantLock lock = new ReentrantLock();
    private int disponivel;

    boolean reservar(int qtd, Duration timeout) throws InterruptedException {
        if (!lock.tryLock(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
            return false; // prefira recusar a empilhar threads
        }
        try {
            if (disponivel < qtd) return false;
            disponivel -= qtd;
            return true;
        } finally {
            lock.unlock();
        }
    }
}
```

`LongAdder` para métricas:

```java
class Metricas {
    private final LongAdder requests = new LongAdder();
    private final LongAdder erros = new LongAdder();

    void registrar(boolean ok) {
        requests.increment();
        if (!ok) erros.increment();
    }

    long total() { return requests.sum(); } // leitura agrega as células
}
```

## Na prática

Meça antes de trocar: use JMH ou um teste de carga com threads reais. Compare `synchronized`, `ReentrantLock`, `AtomicLong` e `LongAdder` com 8, 64 e 256 threads. O ponto de virada varia com o hardware e com o tempo dentro da região crítica.

Reduza a seção crítica: calcule fora do lock, proteja apenas a mutação. Prefira estruturas concorrentes (`ConcurrentHashMap`, `BlockingQueue`) a locks manuais. Se a operação é independente por chave, faça *striping*: um lock por bucket.

## Armadilhas comuns

- `ReadWriteLock` para leituras que duram nanossegundos: o overhead supera o ganho.
- `tryLock` sem `finally` e sem tratar falha.
- Lock fairness ligado por padrão: justo, porém mais lento.
- Medir com `System.nanoTime` sem aquecimento da JVM.
- Achar que `volatile` resolve incremento (`i++` não é atômico).

## Checklist de domínio

- [ ] Sei explicar CAS, false sharing e por que `LongAdder` escala.
- [ ] Escolho lock por perfil de leitura/escrita.
- [ ] Meço contenção com threads reais.
- [ ] Reduzo a região crítica antes de trocar a primitiva.
- [ ] Sei quando recusar trabalho em vez de enfileirar.

## Para ir além

Leia o pacote `java.util.concurrent.atomic` e a documentação de `ReentrantLock`. Depois rode um benchmark com 256 threads e explique a diferença entre `AtomicLong` e `LongAdder`.
