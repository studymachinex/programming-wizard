> **Em uma frase:** relógios de parede contam uma história aproximada; para ordenar fatos e impedir que um líder obsoleto escreva, você precisa de relógios lógicos, incerteza explícita e fencing.

## O problema

Um sistema de leilão recebe dois lances com 3 ms de diferença. O lance A chega ao servidor de São Paulo; o B, ao de Frankfurt. Cada servidor carimba o evento com `System.currentTimeMillis()`. O relógio de Frankfurt está 12 ms adiantado por causa de um ajuste de NTP. Resultado: o lance mais antigo vence, o cliente reclama, e o time descobre que "ordem por timestamp" não é uma ordem.

O mesmo problema aparece em lugares menos óbvios: TTL de cache que expira cedo, lease de liderança que dura mais que o combinado, evento do Kafka ordenado apenas dentro da partição, e logs de incidente que contam uma sequência impossível.

Tempo em sistemas distribuídos não é o que o relógio do computador diz. É uma construção sobre relações de causa e sobre limites de incerteza.

## Como funciona

### Dois relógios, dois usos

**Relógio de parede** (`System.currentTimeMillis`) representa data e hora, mas pode saltar para frente ou para trás quando o NTP ajusta. Use para exibir datas e para TTL aproximado, nunca para medir duração ou ordenar escritas críticas.

**Relógio monotônico** (`System.nanoTime`) só avança. A origem é arbitrária e não se converte em data; use apenas diferenças. É o relógio correto para timeouts, latência e leases.

Mesmo monotônico tem limites: ele para durante suspend-to-RAM em algumas máquinas e não é comparável entre processos. Para duração local, é o melhor que o sistema operacional oferece.

### Ordem causal

A relação **happens-before** de Lamport define que A → B se A e B ocorrem no mesmo processo em sequência, se A é o envio e B a recepção da mesma mensagem, ou por transitividade. Eventos sem essa relação são concorrentes.

Um **relógio de Lamport** é um inteiro: incrementa a cada evento local e, ao receber uma mensagem, vira `max(local, recebido) + 1`. Ele garante que A → B implica `L(A) < L(B)`. A recíproca não vale: valores diferentes não provam causalidade.

Um **version vector** guarda um contador por réplica e detecta concorrência, mas cresce com o número de participantes. Para muitas réplicas, um **Hybrid Logical Clock (HLC)** combina tempo físico e contador lógico em 64 bits: mantém a ordenação causal, aproxima timestamps de datas reais e tem tamanho constante.

```java
final class HybridLogicalClock {
    private long physicalMillis;
    private long logical;

    synchronized long now() {
        long wall = System.currentTimeMillis();
        if (wall > physicalMillis) {
            physicalMillis = wall;
            logical = 0;
        } else {
            logical++;
        }
        return pack();
    }

    synchronized long receive(long remote) {
        long wall = System.currentTimeMillis();
        long remotePhysical = remote >>> 16;
        long remoteLogical = remote & 0xFFFFL;
        long maxPhysical = Math.max(wall, Math.max(physicalMillis, remotePhysical));

        if (maxPhysical == physicalMillis && maxPhysical == remotePhysical) {
            logical = Math.max(logical, remoteLogical) + 1;
        } else if (maxPhysical == physicalMillis) {
            logical++;
        } else if (maxPhysical == remotePhysical) {
            logical = remoteLogical + 1;
        } else {
            logical = 0;
        }

        physicalMillis = maxPhysical;
        return pack();
    }

    private long pack() {
        return (physicalMillis << 16) | (logical & 0xFFFFL);
    }
}
```

Esse HLC é uma versão didática. Em produção, trate overflow do campo lógico e não compare HLCs de máquinas com relógios muito divergentes como se fossem tempo real exato.

### Onde a incerteza aparece: Spanner

O Spanner não assume relógios sincronizados. Ele usa TrueTime, que retorna um intervalo `[earliest, latest]` com incerteza ε. Uma transação só commita depois que `latest` passou do timestamp escolhido — o **commit-wait**. Se ε é 7 ms, você paga cerca de 7 ms por escrita para garantir que nenhuma transação posterior receba um timestamp menor. É consistência externa comprada com latência.

### Fencing: a parte que salva o sistema

Leases são baseados em tempo, e tempo mente. Um líder pode ser pausado por GC por 10 segundos, perder o lease, e acordar achando que ainda manda. Se ele escrever no storage, sobrescreve o novo líder.

A solução não é confiar no relógio; é um **fencing token** monotônico emitido a cada eleição. O recurso rejeita tokens menores que o maior já visto.

```java
record WriteRequest(long fencingToken, String key, String value) {
}

final class FencedStorage {
    private long highestToken = Long.MIN_VALUE;
    private String lastValue;

    synchronized void write(WriteRequest request) {
        if (request.fencingToken() < highestToken) {
            throw new IllegalStateException(
                    "líder obsoleto: token " + request.fencingToken()
                            + " < " + highestToken);
        }
        highestToken = request.fencingToken();
        lastValue = request.value();
    }

    synchronized String read() {
        return lastValue;
    }
}
```

Com isso, mesmo que o líder antigo acorde, a escrita é rejeitada. O token pode vir do etcd, do ZooKeeper ou de um consenso interno; o importante é que o recurso o valide, não apenas o cliente.

## Na prática

- **Ordem de eventos de negócio**: use versão por agregado (`version` incrementada na transação) ou HLC. Não use `created_at` como desempate.
- **Kafka**: a ordem é garantida por partição, não no tópico. Se dois eventos do mesmo pedido vão para partições diferentes, a ordem se perde. Particione pela chave do agregado.
- **TTL e cache**: um TTL de 60 s com relógio 2 s adiantado expira antes. Para expiração rígida, use tempo do servidor central ou tolerância explícita.
- **Locks distribuídos**: lease + fencing. Sem fencing, o lock é uma sugestão.
- **Logs de incidente**: registre tempo monotônico e tempo de parede; a diferença entre eles revela saltos de NTP.

## Armadilhas comuns

- **Usar `currentTimeMillis` para latência.** Um ajuste de NTP pode produzir latência negativa ou picos falsos. Use `nanoTime`.
- **Assumir que timestamp é único.** Duas escritas no mesmo milissegundo são comuns; sem desempate, a ordem é indefinida.
- **Usar last-write-wins com relógio de parede.** Skew de 12 ms faz a escrita mais nova perder. Para dinheiro, LWW é quase sempre errado.
- **Confiar em lease sem fencing.** O processo pausado não sabe que perdeu o lease.
- **Comparar relógios de máquinas diferentes sem incerteza.** "A é 2 ms mais novo" pode ser falso; o correto é "A está no intervalo X".

## Checklist de domínio

- [ ] Você escolhe `nanoTime` para duração e HLC para ordenação
- [ ] Você explica por que `L(A) < L(B)` não prova causalidade
- [ ] Você implementa um fencing token e o valida no recurso
- [ ] Você entende commit-wait e o custo de TrueTime
- [ ] Você sabe por que a ordem do Kafka é por partição

## Para ir além

- [Spanner: Google's Globally-Distributed Database](https://static.googleusercontent.com/media/research.google.com/en//archive/spanner-osdi2012.pdf) — TrueTime e commit-wait no paper original.
- [How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) — a crítica que popularizou fencing tokens.
- [Logical Physical Clocks](https://cse.buffalo.edu/tech-reports/2014-04.pdf) — HLC explicado pelos autores.
