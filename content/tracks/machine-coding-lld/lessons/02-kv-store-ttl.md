> **Em uma frase:** um key-value store com TTL precisa de duas estratégias de expiração, a preguiçosa no acesso e a ativa por um heap, porque nenhuma das duas sozinha controla memória e latência ao mesmo tempo.

## O problema

"Implemente um key-value store em memória com TTL" parece um `HashMap` com timestamp. O código ingênuo guarda `(valor, expiraEm)` e confere a validade no `get`. Funciona até a pergunta seguinte: **e as chaves que ninguém mais lê?** Uma sessão de login criada e abandonada fica para sempre na memória. Com 10 milhões de sessões por dia, o processo morre de `OutOfMemoryError` sem que nenhuma chave "vencida" tenha sido acessada.

A segunda resposta ingênua é uma thread que varre o mapa inteiro a cada segundo. Com 10 milhões de chaves, isso significa 10 milhões de comparações por segundo para remover talvez algumas centenas.

## Como funciona

O Redis resolve com duas estratégias combinadas, e a sua implementação deve fazer o mesmo:

| Estratégia | Quando age | Garante | Custo |
|---|---|---|---|
| Preguiçosa | No `get`, `delete`, `ttl` | Nunca devolve valor vencido | O(1), zero trabalho extra |
| Ativa | Periodicamente, `purgeExpired()` | Memória de chaves abandonadas volta | O(k log n) com heap |

A estratégia ativa precisa responder rápido à pergunta "qual a próxima chave a vencer?". Um `PriorityQueue` ordenado por `expiraEm` dá isso em O(1) para olhar e O(log n) para remover.

```java
import java.util.*;
import java.util.function.LongSupplier;

class KvStore {
    private record Entrada(String valor, long expiraEm) {}
    private record Agendamento(long expiraEm, String chave) {}

    private final LongSupplier relogio;
    private final Map<String, Entrada> dados = new HashMap<>();
    private final PriorityQueue<Agendamento> expiracoes =
            new PriorityQueue<>(Comparator.comparingLong(Agendamento::expiraEm));

    KvStore(LongSupplier relogio) { this.relogio = relogio; }

    void put(String chave, String valor, long ttlMillis) {
        long expiraEm = relogio.getAsLong() + ttlMillis;
        dados.put(chave, new Entrada(valor, expiraEm));
        expiracoes.add(new Agendamento(expiraEm, chave)); // O(log n)
    }

    Optional<String> get(String chave) {
        Entrada e = dados.get(chave);
        if (e == null) return Optional.empty();
        if (e.expiraEm() <= relogio.getAsLong()) { // preguiçosa
            dados.remove(chave);
            return Optional.empty();
        }
        return Optional.of(e.valor());
    }
}
```

### O bug que o entrevistador está esperando

Grave `a` com TTL de 100 ms no instante 0 e de novo com TTL de 100 ms no instante 50. O heap agora tem **dois** agendamentos para `a`: um para 100 e outro para 150. No instante 120, a varredura tira o agendamento de 100 do topo e apaga `a`, que deveria viver até 150.

A correção é tratar o heap como **índice que pode estar desatualizado**: ao tirar um agendamento, confira se ele ainda descreve a versão atual da chave.

```java
int purgeExpired() {
    long agora = relogio.getAsLong();
    int removidas = 0;
    while (!expiracoes.isEmpty() && expiracoes.peek().expiraEm() <= agora) {
        Agendamento a = expiracoes.poll();
        Entrada atual = dados.get(a.chave());
        // agendamento obsoleto: a chave foi regravada ou apagada depois
        if (atual != null && atual.expiraEm() == a.expiraEm()) {
            dados.remove(a.chave());
            removidas++;
        }
    }
    return removidas;
}
```

Essa técnica de **lazy deletion** em heap aparece também no Dijkstra com `PriorityQueue`, que não tem `decreaseKey`. Vale citar na entrevista: mostra que você reconhece o padrão.

## Na prática

- **Semântica de sobrescrita.** No Redis, `SET` sem `EX` remove o TTL anterior. Diga qual semântica você escolheu. Metade dos bugs de cache em produção vem de alguém achar que regravar mantém o TTL.
- **Crescimento do heap.** Chaves regravadas com frequência deixam agendamentos obsoletos. Se isso virar problema, reconstrua o heap quando os obsoletos passarem de, digamos, 50% do tamanho, ou use um mapa de versão por chave.
- **Varredura com orçamento.** O Redis não limpa tudo de uma vez: ele amostra 20 chaves com TTL e repete enquanto mais de 25% delas estiverem vencidas, para não travar o event loop. A versão de entrevista pode receber um `limite` de remoções por chamada.
- **TTL em vez de horário absoluto.** Receber `ttlMillis` e somar ao relógio injetado evita confusão de fuso e de relógio de cliente.

## Armadilhas comuns

- **Comparar com `<` em vez de `<=`.** Defina se a chave está viva no instante exato de expiração e teste isso. A convenção comum é vencida quando `agora >= expiraEm`.
- **`size()` contando chaves vencidas.** Ou você limpa antes de contar ou documenta que o tamanho é aproximado.
- **Thread de limpeza sem sincronização.** Se houver uma thread varrendo enquanto outras fazem `put`, o `HashMap` precisa virar `ConcurrentHashMap` e o heap precisa de lock, ou tudo passa por um lock único. Você vai ver isso na aula de concorrência.
- **Usar `System.currentTimeMillis()` direto.** Ele salta com ajuste de NTP. Para medir intervalos, prefira `System.nanoTime()` em produção, sempre injetado.

## Checklist de domínio

- [ ] Você explica por que só a expiração preguiçosa vaza memória
- [ ] Você implementa a varredura ativa em O(k log n) com heap
- [ ] Você reproduz e corrige o bug do agendamento obsoleto
- [ ] Você conhece a semântica de TTL do `SET` do Redis

## Para ir além

- [Redis: EXPIRE e como as chaves expiram](https://redis.io/docs/latest/commands/expire/): a explicação oficial das expirações passiva e ativa.
- [Caffeine: Expiration](https://github.com/ben-manes/caffeine/wiki/Eviction#time-based): como a biblioteca de cache mais usada em Java resolve expiração com timer wheel.
- [Javadoc de PriorityQueue (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/PriorityQueue.html): custos de `offer`, `poll` e `remove(Object)`.
