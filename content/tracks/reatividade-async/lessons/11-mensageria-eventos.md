> **Em uma frase:** em mensageria, o ack é a linha entre "processei" e "pode me mandar de novo" — coloque-o depois do efeito, nunca antes.

Um consumidor reativo com Kafka parece simples: um método anotado, um `Multi` de entrada, um `ack()`. O que quebra em produção é a semântica de entrega. Se o offset avança antes do commit no banco, uma falha vira perda silenciosa. Se avança depois, uma falha vira reentrega — e o consumidor precisa ser idempotente.

## O problema

O connector SmallRye Kafka, por padrão, entrega pelo menos uma vez. Não existe mágica: o offset é commitado depois que o processamento termina, mas o processo pode morrer entre o commit do banco e o commit do offset. Na próxima inicialização, a mensagem volta. Se o consumidor não souber reconhecer o que já processou, o pedido é criado duas vezes, o e-mail é enviado duas vezes, o saldo é debitado duas vezes.

O erro oposto é confirmar cedo para "liberar o broker". O processamento falha, mas a mensagem já foi confirmada: perda definitiva. Em Kafka, ack e commit de offset não são a mesma coisa, e é justamente essa distância que produz duplicatas ou perdas.

## Como funciona

O fluxo tem quatro atores: tópico, partição, consumidor e offset. A ordem é garantida dentro de uma partição, não no tópico. Por isso a chave de negócio importa: eventos do mesmo `pedidoId` precisam cair na mesma partição para serem processados na ordem em que foram produzidos.

| Estratégia de ack | Quando o offset avança | Risco principal |
|---|---|---|
| `POST_PROCESSING` (padrão) | Depois que o método retorna ou o `Uni` conclui | Duplicata se o efeito commitou e o ack falhou |
| `MANUAL` | Quando você chama `Message.ack()` | Mensagem parada se você esquecer o ack ou o nack |
| `PRE_PROCESSING` | Antes de executar o método | Perda em qualquer falha de processamento |

Com `@Incoming`, o método pode receber o payload direto ou `Message<T>`. Use `Message<T>` quando precisar de metadados, ack manual ou headers. Retornar `Uni<Void>` já permite que o framework aguarde o processamento antes do ack padrão. `@Blocking` é necessário apenas se o corpo do método bloquear — um `Uni` retornado não torna bloqueante o que veio antes dele.

## Na prática

Consumidor idempotente que grava o evento e o registro de processamento na mesma transação:

```java
package com.exemplo.pedidos;

import io.quarkus.hibernate.reactive.panache.Panache;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.reactive.messaging.Acknowledgment;
import org.eclipse.microprofile.reactive.messaging.Incoming;
import org.eclipse.microprofile.reactive.messaging.Message;

@ApplicationScoped
public class PedidoConsumer {

    @Incoming("pedidos")
    @Acknowledgment(Acknowledgment.Strategy.MANUAL)
    public Uni<Void> consumir(Message<PedidoEvento> mensagem) {
        PedidoEvento evento = mensagem.getPayload();

        return Panache.withTransaction(() -> registrarUmaVez(evento))
            .chain(() -> Uni.createFrom().completionStage(mensagem.ack()))
            .onFailure().call(erro ->
                Uni.createFrom().completionStage(mensagem.nack(erro)));
    }

    private Uni<Void> registrarUmaVez(PedidoEvento evento) {
        return Processado.<Processado>findById(evento.eventoId())
            .flatMap(existente -> {
                if (existente != null) {
                    return Uni.createFrom().voidItem();
                }
                return Pedido.criar(evento)
                    .chain(pedido -> Processado.registrar(evento.eventoId()))
                    .replaceWithVoid();
            });
    }
}
```

O `ack()` só acontece depois do commit da transação. Se a transação falhar, o `nack` entrega a falha ao connector, que aplica a estratégia configurada. O `findById` é uma otimização; a garantia real é a chave primária de `Processado`: duas instâncias concorrentes podem passar pelo `findById`, e a segunda inserção falha na constraint. Trate essa violação como "já processado", não como erro.

Configuração do consumidor e da DLQ:

```properties
mp.messaging.incoming.pedidos.connector=smallrye-kafka
mp.messaging.incoming.pedidos.topic=pedidos
mp.messaging.incoming.pedidos.group.id=financeiro
mp.messaging.incoming.pedidos.auto.offset.reset=earliest
mp.messaging.incoming.pedidos.enable.auto.commit=false
mp.messaging.incoming.pedidos.failure-strategy=dead-letter-queue
mp.messaging.incoming.pedidos.dead-letter-queue.topic=pedidos-dlq
```

Para produzir com chave de partição, use metadados do Kafka:

```java
@Inject
@Channel("pedidos")
Emitter<PedidoEvento> emitter;

public void publicar(PedidoEvento evento) {
    emitter.send(Message.of(evento)
        .addMetadata(OutgoingKafkaRecordMetadata.<String>builder()
            .withKey(evento.pedidoId())
            .build()));
}
```

A mesma chave garante a mesma partição enquanto o número de partições não mudar. Aumentar partições quebra a ordenação de chaves que já existiam — planeje isso antes, não durante um incidente.

## Armadilhas comuns

- Fazer ack antes do commit "para não reprocessar": troca duplicata por perda.
- Consumidor não idempotente com retry automático: cada reentrega duplica o efeito.
- Processar em paralelo dentro da mesma partição e esperar ordem.
- Usar `@Blocking` por reflexo: segura uma worker thread à toa quando o processamento é reativo.
- Retry interno longo: a partição para de avançar e o lag cresce sem limite.
- Acreditar que `enable.auto.commit=false` sozinho garante exactly-once.

## Checklist de domínio

- [ ] Sei em que momento o offset é commitado no meu consumidor.
- [ ] Meu efeito de negócio e meu registro de idempotência commitam juntos.
- [ ] Escolho a chave de partição pensando na ordem que o negócio exige.
- [ ] Configurei DLQ e sei quem monitora e reprocessa essa fila.
- [ ] Sei distinguir erro transitório de envenenamento de mensagem.
- [ ] Testei reentrega e concorrência, não apenas o caminho feliz.

## Para ir além

Leia o guia de Kafka do Quarkus sobre acknowledgment e failure strategies. Depois simule a morte do processo entre o commit do banco e o ack, reinicie e prove que o consumidor não duplica o efeito.

- [Quarkus — Using Apache Kafka with Reactive Messaging](https://quarkus.io/guides/kafka)
- [SmallRye Reactive Messaging — Kafka](https://smallrye.io/smallrye-reactive-messaging/latest/kafka/)
- [Quarkus — Hibernate Reactive with Panache](https://quarkus.io/guides/hibernate-reactive)
