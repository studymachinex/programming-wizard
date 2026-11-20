> **Em uma frase:** não existe transação ACID entre serviços; existe coreografia de compensações e um outbox que garante que o evento saia mesmo se o processo morrer.

Um pedido envolve estoque, pagamento e envio, cada um em um serviço. Não há `BEGIN ... COMMIT` que atravesse os três. Saga resolve com passos e compensações; outbox resolve a publicação confiável entre banco e broker.

## O problema

O serviço de pedido grava no banco e publica no Kafka. O processo cai entre as duas operações: pedido existe, evento não. Ou o evento sai e o commit falha: consumidor processa algo que não existe. Publicar direto no broker dentro da requisição é uma promessa que ninguém consegue cumprir.

## Como funciona

**Outbox:** na mesma transação do agregado, insira o evento em uma tabela `outbox`. Um relay lê, publica e marca como enviado. Se o processo morrer, o evento continua lá.

```sql
CREATE TABLE outbox (
  id bigint generated always as identity primary key,
  aggregate_id text not null,
  tipo text not null,
  payload jsonb not null,
  criado_em timestamptz default now(),
  publicado_em timestamptz
);
CREATE INDEX ON outbox (publicado_em) WHERE publicado_em IS NULL;
```

```java
@Transactional
public Pedido criar(PedidoRequest req) {
    var pedido = repo.save(Pedido.novo(req));
    outbox.save(Evento.de("PedidoCriado", pedido));
    return pedido;
}

@Scheduled(fixedDelay = 500)
public void relay() {
    outbox.naoPublicados(100).forEach(e -> {
        kafka.send(e.topico(), e.chave(), e.payload());
        outbox.marcarPublicado(e.id());
    });
}
```

**Saga:** cada passo tem uma compensação. Se o pagamento falha, libere o estoque. Orquestrada (um coordenador) é mais fácil de observar; coreografada (eventos) acopla menos, mas o fluxo fica implícito.

```java
saga.passo("reservar-estoque", estoque::reservar, estoque::liberar)
    .passo("cobrar", pagamento::cobrar, pagamento::estornar)
    .passo("enviar", envio::agendar, envio::cancelar)
    .executar(pedido);
```

## Na prática

Compensações precisam ser idempotentes e podem falhar; trate com retry e DLQ. Não prometa rollback instantâneo: o estado intermediário é visível. Use estados explícitos (`AGUARDANDO_PAGAMENTO`, `CANCELANDO`) e uma máquina de estados.

Outbox com polling é simples; CDC (Debezium) reduz latência e carga. Garanta ordenação por agregado usando a chave de partição.

## Armadilhas comuns

- Publicar no Kafka dentro da transação e achar que é atômico.
- Relay que marca como publicado antes do ACK do broker.
- Compensação não idempotente.
- Saga sem timeout e sem estado de falha.
- Evento sem versão/schema.

## Checklist de domínio

- [ ] Implemento outbox transacional e relay.
- [ ] Sei a diferença entre orquestração e coreografia.
- [ ] Compensações são idempotentes.
- [ ] Tenho DLQ e retry.
- [ ] Modelo estados intermediários.

## Para ir além

Leia o padrão Transactional Outbox em microservices.io e o artigo de sagas de Chris Richardson. Depois implemente um pedido com compensação e simule falha no meio.
