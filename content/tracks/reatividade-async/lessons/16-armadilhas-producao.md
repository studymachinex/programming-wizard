> **Em uma frase:** os incidentes de código assíncrono raramente são exóticos; são um `Uni` não assinado, um buffer sem limite ou uma thread esperando outra que nunca vai chegar.

Produção expõe o que o teste feliz esconde. Um endpoint que responde `200` sem gravar nada, um pool que para de aceitar conexões, um heap que cresce até o OOM, um log sem `traceId`. Todos têm a mesma característica: o código compila, os testes passam e o efeito simplesmente não acontece — ou acontece duas vezes.

## O problema

O primeiro bug silencioso é a laziness. `Uni` e `Multi` não fazem nada até a assinatura. Chamar um método que devolve `Uni` e ignorar o retorno é equivalente a não chamar o método. Não há exceção, não há log, não há query: só ausência.

O segundo é a fronteira de transação. `@Transactional` em um método que retorna `Uni` abre e fecha a transação durante a construção da cadeia, antes de qualquer operação assíncrona. O SQL roda fora da transação, ou falha porque a sessão já foi fechada. O sintoma é um `200` com dados incompletos.

## Como funciona

Diagnóstico começa por separar sintoma de causa. A tabela abaixo é um ponto de partida:

| Sintoma | Causa provável | Evidência | Correção |
|---|---|---|---|
| Latência alta com CPU ociosa | Bloqueio no event loop | Dump com event loop em socket read/`WAITING` | `@Blocking` ou driver reativo |
| `200` sem efeito no banco | `Uni` não assinado | Nenhum SQL no log; nenhuma métrica de escrita | Retornar ou assinar a cadeia |
| Transação vazia | `@Transactional` em método que retorna `Uni` | Commit antes da query | `Panache.withTransaction` dentro do `Uni` |
| OOM sob carga | Buffer ou fila sem limite | Heap dump com listas e filas grandes | `buffer(n)`, `drop()` ou rejeição |
| Pool parado | Deadlock por ordem de locks | Dump com `Found one Java-level deadlock` | Ordem global ou `tryLock` com timeout |
| Log sem `traceId` | `ThreadLocal`/MDC não propagado | Threads diferentes no mesmo request | Context propagation ou ID explícito |

Para deadlock, três dumps espaçados de 5 segundos valem mais que um: se os mesmos threads aparecem `BLOCKED` no mesmo monitor, não é lentidão, é espera circular. `jcmd <pid> Thread.print -l` mostra os locks; `jstack <pid>` faz o mesmo. Para memória, `jcmd <pid> GC.heap_dump arquivo.hprof` e procure as coleções que dominam o heap.

## Na prática

O bug clássico em duas linhas:

```java
// BUG: o persist devolve Uni e ninguém assina; a transação ainda fecha antes.
@Transactional
public Uni<Pedido> criar(PedidoRequest request) {
    pedidoRepository.persist(request.paraEntidade());
    return Uni.createFrom().item(new Pedido(request.id()));
}
```

A correção devolve a cadeia e coloca a transação dentro dela:

```java
public Uni<Pedido> criar(PedidoRequest request) {
    return Panache.withTransaction(() ->
        pedidoRepository.persist(request.paraEntidade())
            .chain(pedido -> eventos.publicar(pedido).replaceWith(pedido)));
}
```

Publicar o evento dentro da transação resolve o encadeamento, mas não o dual-write: o commit do banco e o envio ao broker não são atômicos. Se a mensagem precisa sair exatamente quando o dado commitou, use outbox transacional e um publicador separado.

Deadlock por ordem de aquisição é o outro clássico. Duas transferências entre as mesmas contas, em sentidos opostos, travam:

```java
public void transferir(Conta origem, Conta destino, BigDecimal valor) {
    Conta primeira = origem.id() < destino.id() ? origem : destino;
    Conta segunda = origem.id() < destino.id() ? destino : origem;

    synchronized (primeira) {
        synchronized (segunda) {
            origem.debitar(valor);
            destino.creditar(valor);
        }
    }
}
```

Uma ordem global elimina o ciclo. Em Java 21, prefira `ReentrantLock` com `tryLock(timeout)` quando precisar de timeout: `synchronized` prende a carrier thread e pode causar pinning em virtual threads. Com timeout, o segundo lock falha de forma controlada em vez de esperar para sempre.

Buffers merecem atenção especial. `multi.onOverflow().buffer()` é ilimitado: cresce até a memória acabar. `buffer(256)` limita, mas quando enche propaga `BackPressureFailure` e cancela a fonte — o que é melhor do que OOM, desde que alguém trate a falha. `drop()` só é aceitável quando perder item é parte do negócio.

## Armadilhas comuns

- `subscribe()` sem guardar o `Cancellable`: stream infinito que ninguém cancela.
- Assinar o mesmo `Multi` frio duas vezes e executar a query duas vezes.
- `@Transactional` em método reativo: a anotação não acompanha a assinatura.
- `onOverflow().buffer()` sem tamanho em conexão de longa duração.
- `ThreadLocal`/MDC assumindo que a thread é a mesma depois de um `publishOn`.
- Pools separados por dependência, mas health check compartilhando o mesmo pool.
- Aumentar o pool para "resolver" starvation: você só aumenta o número de threads esperando.

## Checklist de domínio

- [ ] Sei provar que todo `Uni`/`Multi` crítico é assinado.
- [ ] Não uso `@Transactional` bloqueante em método que retorna `Uni`.
- [ ] Meus buffers e filas têm limite e política de overflow explícita.
- [ ] Sei ler um thread dump e identificar `BLOCKED`, `WAITING` e deadlock.
- [ ] Distingo starvation de pool de lentidão de dependência.
- [ ] Meus logs carregam correlação mesmo quando a thread muda.

## Para ir além

Leia o guia de contexto do Quarkus e a documentação de `ThreadMXBean`. Depois provoque um deadlock em um teste com dois locks em ordens opostas, capture o dump e escreva o laudo do incidente.

- [Quarkus — Context propagation](https://quarkus.io/guides/context-propagation)
- [Java 21 — ThreadMXBean](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/management/ThreadMXBean.html)
- [Quarkus — Virtual threads](https://quarkus.io/guides/virtual-threads)
