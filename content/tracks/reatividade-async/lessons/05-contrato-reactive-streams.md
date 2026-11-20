> **Em uma frase:** Reactive Streams não é um framework nem um tipo de fila; é um contrato de quatro interfaces em que o consumidor pede, o produtor respeita e os sinais terminais encerram a conversa.

O contrato cabe em poucas assinaturas, mas é fácil violá-lo sem perceber. A maioria dos incidentes de reatividade nasce de um `Subscriber` que nunca chama `request`, de um produtor que emite sem demanda ou de um `onNext` que bloqueia a thread que deveria estar atendendo o mundo.

## O problema

Um componente recebe eventos de um broker e os entrega a um `Subscriber` que grava em banco. O produtor ignora a demanda e empurra 10.000 eventos por segundo; o consumidor grava 800 por segundo. Sem contrapressão, os eventos se acumulam em memória até o processo morrer por OOM. Se o consumidor, por outro lado, esquecer de pedir, o stream simplesmente não anda e parece “travado”.

O contrato existe para tornar esse diálogo explícito: quem consome declara quanto aguenta, quem produz só entrega até esse limite, e qualquer encerramento tem um único caminho.

## Como funciona

São quatro tipos:

- `Publisher<T>`: fonte que aceita `subscribe(Subscriber<? super T>)`.
- `Subscriber<T>`: recebe `onSubscribe`, `onNext`, `onError` e `onComplete`.
- `Subscription`: ligação entre os dois; oferece `request(long)` e `cancel()`.
- `Processor<T,R>`: é `Subscriber<T>` e `Publisher<R>` ao mesmo tempo; um operador no meio do fluxo.

A sequência é sempre a mesma:

1. O `Subscriber` chama `publisher.subscribe(this)`.
2. O `Publisher` chama `subscriber.onSubscribe(subscription)` — uma única vez.
3. O `Subscriber` chama `subscription.request(n)` com `n > 0`.
4. O `Publisher` pode chamar `onNext` até a demanda acumulada.
5. O fluxo termina com `onComplete` **ou** `onError`, nunca os dois, e nada é emitido depois.

`onNext` não pode ser chamado mais vezes do que a demanda autorizou. Os sinais precisam ser serializados: nada de dois `onNext` concorrentes. E o `Subscriber` pode chamar `cancel()` a qualquer momento; o `Publisher` deve parar de emitir.

No JDK, o contrato está em `java.util.concurrent.Flow`, com `Flow.Publisher`, `Flow.Subscriber`, `Flow.Subscription` e `Flow.Processor`. Um `Subscriber` escrito à mão deixa as regras visíveis:

```java
package br.com.loja.stream;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Flow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class ColetorPedidos implements Flow.Subscriber<Pedido> {

    private static final Logger log = LoggerFactory.getLogger(ColetorPedidos.class);

    private final List<Pedido> recebidos = new ArrayList<>();
    private Flow.Subscription subscription;

    @Override
    public void onSubscribe(Flow.Subscription subscription) {
        this.subscription = subscription;
        subscription.request(1); // demanda inicial
    }

    @Override
    public void onNext(Pedido pedido) {
        recebidos.add(pedido);       // processamento curto
        subscription.request(1);     // pede o próximo só depois de processar
    }

    @Override
    public void onError(Throwable erro) {
        log.error("fluxo falhou após {} pedidos", recebidos.size(), erro);
    }

    @Override
    public void onComplete() {
        log.info("fluxo completo com {} pedidos", recebidos.size());
    }
}
```

`SubmissionPublisher` é uma implementação pronta de `Flow.Publisher` no JDK. Ela usa um buffer interno de `Flow.defaultBufferSize()` (256) e faz o produtor esperar quando ele enche — uma forma simples de contrapressão:

```java
import java.util.concurrent.SubmissionPublisher;

try (var publisher = new SubmissionPublisher<Pedido>()) {
    publisher.subscribe(new ColetorPedidos());

    for (var pedido : pedidos) {
        publisher.submit(pedido); // bloqueia se o buffer estiver cheio
    }
}
```

`submit` bloqueia; `offer` permite tentar por um tempo e desistir. Se o produtor roda no event loop, bloquear é inaceitável: nesse caso, use `offer` com timeout e uma política explícita de descarte ou erro.

| Aspecto | Publisher frio (cold) | Publisher quente (hot) |
|---|---|---|
| Início da produção | A cada assinatura | Independente de assinantes |
| Assinatura tardia | Recebe tudo desde o início | Perde o que já passou |
| Backpressure | Fonte normalmente respeita | Precisa de buffer ou descarte |
| Exemplos | `Flux.fromIterable`, consulta | Sensor, evento de UI, broker |
| Uso típico | request/response | telemetria e streams contínuos |

## Na prática

A demanda é a alavanca de desempenho. `request(1)` processa item a item, com menos memória e mais idas e voltas. `request(64)` ou `request(256)` reduz o overhead de sinalização. `request(Long.MAX_VALUE)` desliga a contrapressão e só é aceitável quando o consumidor é comprovadamente mais rápido e o volume é limitado. O publisher também tem obrigações: não emitir sem demanda, não emitir depois de `cancel()` e nunca chamar `onNext` fora de ordem.

Escolha o buffer pelo pior caso, não pela média. O `SubmissionPublisher` bloqueia o produtor quando o buffer enche; isso é contrapressão de verdade, mas transferida para quem produz. Se o produtor não pode bloquear, você precisa de `offer` com timeout, `drop` ou `error` — e precisa dizer no contrato o que acontece com o item perdido.

Em operadores reativos, o `Processor` é o ponto onde a demanda pode ser transformada. Um `flatMap`, por exemplo, assina vários publishers internos e combina a demanda; se ele pede `Long.MAX_VALUE` à fonte, a contrapressão morre ali. Por isso configurar concorrência e prefetch é parte de respeitar o contrato, não um detalhe de performance.

## Armadilhas comuns

- `Subscriber` que nunca chama `request` e conclui que o publisher “não emite”.
- `request(Long.MAX_VALUE)` como padrão, seguido de fila ilimitada e OOM.
- `onNext` com chamada JDBC ou HTTP lenta, bloqueando a thread do produtor.
- Emitir depois de `onComplete`/`onError` ou chamar os dois sinais terminais.
- `onNext` concorrente de várias threads sem serialização.
- Ignorar `cancel()` em um publisher customizado e continuar produzindo.
- Tratar um `Processor` como se fosse thread-safe por ser “reativo”.

## Checklist de domínio

- [ ] Explico o papel de `Publisher`, `Subscriber`, `Subscription` e `Processor`.
- [ ] Sei quem chama `request(n)` e o que acontece se ninguém chamar.
- [ ] Distingo `onComplete` de `onError` e sei que são mutuamente exclusivos.
- [ ] Reconheço um publisher frio e um quente pelo comportamento da assinatura.
- [ ] Sei onde a contrapressão pode ser perdida no meio de um pipeline.
- [ ] Meu `Subscriber` não bloqueia em `onNext`.

## Para ir além

Leia o javadoc de `Flow` e de `SubmissionPublisher` e implemente um `Subscriber` que peça um item por vez. Depois troque para `request(10)` e compare throughput, latência e uso de memória. Por fim, force um `onNext` lento e observe o produtor sendo bloqueado.

- [Java 21 — Flow](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/Flow.html)
- [Java 21 — Flow.Subscription](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/Flow.Subscription.html)
- [Java 21 — SubmissionPublisher](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/SubmissionPublisher.html)
