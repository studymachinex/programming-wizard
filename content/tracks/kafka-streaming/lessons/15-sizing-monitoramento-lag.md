> **Em uma frase:** lag de consumidor é o sintoma; a causa pode ser partição insuficiente, consumidor lento, rebalanceamento ou um poison pill.

Dimensionar Kafka não é só escolher o número de partições. É garantir que o consumidor acompanhe a produção, que o rebalanceamento não pare o mundo e que o disco não encha. Lag é a métrica central.

## O problema

Um tópico com 3 partições recebe 30 MB/s. Cada consumidor processa 5 MB/s. Mesmo com 10 instâncias, só 3 consomem — as outras ficam ociosas. O lag cresce, e ninguém entende por que adicionar pods não resolve.

## Como funciona

Paralelismo máximo = número de partições. Adicione partições antes de escalar consumidores. Mas partições demais aumentam latência de eleição, memória e tempo de rebalanceamento.

Fórmula prática: `partições >= throughput / throughput por consumidor`, com margem para picos. Considere também o paralelismo de produção e a ordem por chave.

Lag por partição:

```bash
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group pedidos-workers
```

Métricas no consumidor:

```java
var metrics = consumer.metrics();
long lag = 0;
for (var entry : metrics.entrySet()) {
    if (entry.getKey().name().equals("records-lag-max")) {
        lag = (long) entry.getValue().metricValue();
    }
}
```

Melhor: exponha via Micrometer/JMX e alerte por partição.

## Na prática

Causas comuns de lag:

- Consumidor faz chamada síncrona lenta por mensagem.
- `max.poll.records` alto e processamento longo estourando `max.poll.interval.ms`.
- Rebalanceamento frequente por timeout.
- Poison pill bloqueando a partição.
- Poucas partições.

Correções: processe em lote, aumente concorrência dentro do consumidor com cuidado, use retry tópicos e DLQ, ajuste `fetch.min.bytes` e `max.poll.interval.ms`. Para picos, escale consumidores até o número de partições.

## Armadilhas comuns

- Adicionar consumidores além das partições.
- Aumentar partições e quebrar ordem por chave existente.
- `auto.offset.reset=latest` e perder dados.
- Ignorar lag por partição.
- Rebalanceamento em loop por processamento longo.

## Checklist de domínio

- [ ] Calculo partições por throughput.
- [ ] Monitoro lag por partição.
- [ ] Sei o efeito de `max.poll.records`.
- [ ] Trato poison pill com DLQ.
- [ ] Evito rebalanceamento desnecessário.

## Para ir além

Leia o guia de operação do Kafka e as métricas de consumer group. Depois simule um consumidor lento e acompanhe o lag crescer.
