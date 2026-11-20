> **Em uma frase:** janela sem `grace period` perde evento atrasado; join sem co-partição não junta nada — e o bug só aparece em produção.

Eventos chegam fora de ordem. Uma janela de cinco minutos que fecha ao bater o relógio descarta o pagamento que chegou 30 segundos depois. Um join entre streams só funciona se as chaves estiverem na mesma partição. Esses detalhes decidem se a agregação está correta.

## O problema

Um dashboard conta pedidos por minuto. O produtor sofre retry e um evento de 10:03 chega às 10:06. Sem tolerância, ele é ignorado e o número mente. Um join de pedidos com pagamentos por `pedidoId` falha silenciosamente porque os tópicos usam partições diferentes.

## Como funciona

Janelas no Kafka Streams:

- **Tumbling:** fixa, sem sobreposição.
- **Hopping:** fixa, com avanço menor que o tamanho.
- **Sliding:** baseada no intervalo entre eventos.
- **Session:** agrupa por atividade com gap.

`grace` define quanto tempo aceitar atrasos após o fim da janela.

```java
var pedidos = builder.stream("pedidos", Consumed.with(Serdes.String(), pedidoSerde));

var porMinuto = pedidos
    .groupByKey()
    .windowedBy(TimeWindows.ofSizeAndGrace(
        Duration.ofMinutes(1), Duration.ofSeconds(30)))
    .count(Materialized.as("contagem-por-minuto"));

porMinuto.toStream()
    .map((k, v) -> KeyValue.pair(k.key() + "@" + k.window().start(), v))
    .to("contagem-pedidos", Produced.with(Serdes.String(), Serdes.Long()));
```

Joins:

```java
var pagos = pedidos.join(pagamentos,
    (pedido, pagamento) -> new PedidoPago(pedido, pagamento),
    JoinWindows.ofTimeDifferenceAndGrace(
        Duration.ofMinutes(5), Duration.ofSeconds(30)));
```

Stream-stream join mantém buffers; o custo cresce com a janela. Stream-table join é mais barato: a tabela é materializada e consultada por chave.

## Na prática

Garanta co-partição: mesma quantidade de partições e mesma chave nos dois tópicos. Caso contrário, use `repartition()` antes do join.

Escolha o grace pelo p99 de atraso real, não por chute. Monitore `late-record-drop` e `skipped-records`. Eventos muito atrasados vão para um tópico de quarentena.

Para relatórios, materialize a agregação e sirva via leitura; não recalcule a janela a cada consulta.

## Armadilhas comuns

- Janela sem grace e perda silenciosa.
- Join com partições diferentes.
- Chave nula no `groupByKey`.
- Retenção do state store menor que a janela.
- Emitir resultado a cada update sem downstream idempotente.

## Checklist de domínio

- [ ] Escolho tipo de janela por pergunta de negócio.
- [ ] Configuro grace e quarentena.
- [ ] Garanto co-partição no join.
- [ ] Entendo custo de buffer e state store.
- [ ] Monitoro registros atrasados.

## Para ir além

Leia a documentação de windowing e joins do Kafka Streams. Depois simule eventos atrasados e prove que o grace os inclui.
