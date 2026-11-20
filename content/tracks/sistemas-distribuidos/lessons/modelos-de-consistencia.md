> **Em uma frase:** "consistência" não é uma escala única de força; é um conjunto de garantias diferentes, e você escolhe uma por operação, não uma para o sistema inteiro.

## O problema

Um serviço de comentários usa réplicas de leitura. O usuário responde a um comentário e, ao atualizar a página, vê a resposta antes do comentário original. Outro usuário, em outro continente, vê os dois na ordem certa. O suporte recebe "o site está embaralhando as conversas", mas o banco não perdeu nada: o problema é de **ordem observável**, não de durabilidade.

A equipe tenta resolver com "consistência forte em tudo". O resultado é que cada comentário passa a exigir um round-trip à liderança no outro hemisfério: p99 de 180 ms para uma operação que deveria custar 20 ms. E, ainda assim, a ordem pode quebrar se a aplicação consultar duas réplicas diferentes em sequência.

O erro é tratar consistência como um botão de força. Ela é uma pilha de garantias com preços distintos.

## Como funciona

### As garantias que importam

**Linearizability** é sobre um único objeto e tempo real. Se a escrita de X terminou antes da leitura de X começar, a leitura precisa enxergar o novo valor. É o que se espera de um compare-and-swap ou de um lock. Custa coordenação: a operação precisa passar por um ponto que ordena as requisições.

**Serializability** é sobre transações. O resultado de executar várias transações é equivalente a alguma ordem serial. Não exige que essa ordem respeite o tempo real — isso é **strict serializability**, a combinação das duas.

**Snapshot isolation (SI)** dá a cada transação um snapshot consistente, mas permite write skew: dois médicos de plantão leem que há dois médicos e cada um tira folga. O PostgreSQL chama de `repeatable read` o que é, na prática, snapshot isolation. O relatório do Jepsen sobre PostgreSQL 12.3 mostrou anomalias G2-item justamente nesse nível e um bug no `serializable` da época.

**Consistência causal** preserva a ordem de eventos que têm relação de causa. Se A causou B, ninguém vê B sem A. Eventos concorrentes podem ser ordenados de formas diferentes em réplicas diferentes. É o meio-termo que resolve o comentário fora de ordem sem pagar consenso global.

**Consistência eventual** diz apenas que, se as escritas pararem, as réplicas convergem. Não diz quando, nem em que ordem, nem o que o usuário vê no meio do caminho.

### Garantias de sessão: o que o usuário percebe

Na prática, o usuário não sabe o que é linearizability. Ele percebe quatro coisas:

| Garantia | O que promete | Como implementar |
|---|---|---|
| Read-your-writes | O autor vê sua própria escrita | Sticky session, ler da liderança, token de versão |
| Monotonic reads | Uma sessão nunca volta no tempo | Fixar réplica ou exigir versão mínima |
| Monotonic writes | Escritas do mesmo cliente são aplicadas em ordem | Afinidade por cliente ou sequência |
| Writes-follow-reads | Uma escrita é ordenada após a leitura que a motivou | Token causal propagado |

Essas garantias custam pouco e resolvem a maior parte dos bugs de percepção. Você não precisa de consenso global para garantir que o autor veja o próprio comentário.

### Version vectors: detectar concorrência

Um contador simples não distingue "A aconteceu antes de B" de "A e B são concorrentes". Um version vector guarda um contador por réplica. Se todos os componentes de A são menores ou iguais aos de B, e pelo menos um é menor, então A aconteceu antes de B. Se há componentes maiores em ambos os lados, são concorrentes.

```java
import java.util.HashMap;
import java.util.Map;

final class VersionVector {
    private final Map<String, Long> counters = new HashMap<>();

    void increment(String replicaId) {
        counters.merge(replicaId, 1L, Long::sum);
    }

    void merge(VersionVector other) {
        other.counters.forEach((replica, count) ->
                counters.merge(replica, count, Math::max));
    }

    boolean happensBefore(VersionVector other) {
        boolean strictlyLess = false;
        for (var entry : counters.entrySet()) {
            long mine = entry.getValue();
            long theirs = other.counters.getOrDefault(entry.getKey(), 0L);
            if (mine > theirs) {
                return false;
            }
            if (mine < theirs) {
                strictlyLess = true;
            }
        }
        for (var entry : other.counters.entrySet()) {
            if (entry.getValue() > counters.getOrDefault(entry.getKey(), 0L)) {
                strictlyLess = true;
            }
        }
        return strictlyLess;
    }

    boolean concurrentWith(VersionVector other) {
        return !happensBefore(other) && !other.happensBefore(this);
    }
}
```

Com três réplicas e alto volume, cada evento carrega metadados; em milhões de dispositivos, o custo deixa de ser trivial. Dynamo usou vectors e depois evoluiu para alternativas mais enxutas.

### Ordenar causalmente na entrega

Detectar concorrência não basta; o consumidor precisa **esperar** dependências. Um inbox causal segura um evento até que todos os eventos dos quais ele depende tenham sido entregues.

```java
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class CausalInbox {
    private final Map<String, Set<String>> dependencies = new HashMap<>();
    private final Map<String, Long> deliveredVersion = new HashMap<>();
    private final List<Event> pending = new ArrayList<>();

    void receive(Event event) {
        dependencies.put(event.id(), event.dependsOn());
        pending.add(event);
        drain();
    }

    private void drain() {
        boolean progress = true;
        while (progress) {
            progress = false;
            var iterator = pending.iterator();
            while (iterator.hasNext()) {
                Event event = iterator.next();
                boolean ready = event.dependsOn().stream()
                        .allMatch(dep -> deliveredVersion.getOrDefault(dep, 0L)
                                >= event.dependencyVersion());
                if (ready) {
                    deliver(event);
                    iterator.remove();
                    progress = true;
                }
            }
        }
    }

    private void deliver(Event event) {
        deliveredVersion.merge(event.origin(), event.version(), Math::max);
    }
}

record Event(String id, String origin, long version, Set<String> dependsOn, long dependencyVersion) {
}
```

Esse inbox é uma simplificação: dependências por id e versão, sem GC. Em produção, você precisa de watermark e de um limite para não segurar memória indefinidamente.

## Na prática

Mapeie cada operação para a garantia mais fraca que ainda é correta:

- **Saldo e transferência**: linearizable ou strict serializable no objeto-chave. Um `UPDATE ... WHERE balance >= ?` atômico resolve mais barato que um lock distribuído.
- **Comentários e threads**: causal. O autor vê o próprio comentário; respostas nunca aparecem antes do pai.
- **Feed**: eventual com limite de staleness. Um post pode demorar 2 segundos; o usuário não cancela a assinatura por isso.
- **Catálogo de produtos**: read-your-writes para o time que edita; eventual para o comprador.

No DynamoDB, leitura fortemente consistente consome o dobro de RCUs e não existe em Global Tables. No Cassandra, `QUORUM` atravessa data centers; `LOCAL_QUORUM` mantém a latência regional e aceita uma janela de inconsistência. O preço está na configuração, não no marketing.

## Armadilhas comuns

- **Dizer "eventual" e não definir staleness.** Sem métrica de lag e sem limite, o time de produto não sabe o que prometer.
- **Confundir linearizability com serializability.** Um sistema pode ser linearizável por chave e não oferecer transações multi-chave.
- **Assumir que read replica é read-your-writes.** O autor atualiza, a página recarrega em outra réplica e a alteração "some".
- **Usar snapshot isolation achando que é serializable.** Write skew passa; valide com testes de concorrência, não com intuição.
- **Carregar vector clock em todo evento para sempre.** Metadados crescem; defina poda e um modelo de conflito explícito.

## Checklist de domínio

- [ ] Você distingue linearizability, serializability e strict serializability
- [ ] Você escolhe uma garantia de sessão para um fluxo real
- [ ] Você detecta eventos concorrentes com version vector
- [ ] Você explica por que PostgreSQL `repeatable read` não é serializable
- [ ] Você define um limite de staleness para uma leitura eventual

## Para ir além

- [Jepsen: consistency models](https://jepsen.io/consistency) — referência visual e precisa.
- [Replicated Data Consistency Explained Through Baseball](https://www.microsoft.com/en-us/research/publication/replicated-data-consistency-explained-through-baseball/) — intuição sem matemática pesada.
- [Jepsen: PostgreSQL 12.3](https://jepsen.io/analyses/postgresql-12.3) — o caso real de SI e G2-item.
