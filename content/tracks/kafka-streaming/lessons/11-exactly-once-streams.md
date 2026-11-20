> **Em uma frase:** exactly-once do Kafka cobre read-process-write dentro do cluster; qualquer efeito externo ainda exige idempotência sua.

Kafka oferece transações que tornam a escrita de offsets e de resultados atômica. Com `exactly_once_v2`, um job pode ler, processar e escrever sem duplicar em caso de falha. Isso não significa que o mundo externo seja transacional.

## O problema

Um job lê pedidos, calcula total e grava em outro tópico. Se ele cai depois de escrever e antes de commitar o offset, o reprocessamento duplica o resultado. Com transações, a escrita fica invisível até o commit, e os offsets são commitados juntos.

## Como funciona

Transações usam `transactional.id`, `initTransactions`, `beginTransaction`, `send` e `commitTransaction`. Consumidores com `isolation.level=read_committed` só veem dados commitados.

```java
props.put("transactional.id", "total-pedidos-1");
props.put("enable.idempotence", "true");
props.put("processing.guarantee", "exactly_once_v2");

try (var producer = new KafkaProducer<String, Total>(props)) {
    producer.initTransactions();
    producer.beginTransaction();
    try {
        for (var record : records) {
            var total = calcular(record.value());
            producer.send(new ProducerRecord<>("totais", record.key(), total));
        }
        producer.sendOffsetsToTransaction(offsets, consumerGroup);
        producer.commitTransaction();
    } catch (Exception e) {
        producer.abortTransaction();
        throw e;
    }
}
```

Kafka Streams ativa com uma linha:

```java
props.put(StreamsConfig.PROCESSING_GUARANTEE_CONFIG,
    StreamsConfig.EXACTLY_ONCE_V2);
```

## Na prática

Transações têm custo: mais latência, timeouts e limpeza de marcadores. Use quando duplicata é inaceitável. Para analytics tolerante, at-least-once + dedup pode ser mais barato.

Efeitos externos: grave no banco com chave de idempotência na mesma transação local, ou use outbox. O commit do Kafka não pode abranger o banco. Um e-mail enviado antes do abort continua enviado.

`transaction.timeout.ms` precisa caber no processamento; transação expirada aborta. Monitore `aborted-transactions` e `transaction-coordinator` errors.

## Armadilhas comuns

- Achar que exactly-once cobre HTTP/banco.
- `transactional.id` compartilhado entre instâncias: fencing indesejado.
- Consumidor com `read_uncommitted` e leitura de dados abortados.
- Transação longa estourando timeout.
- Não tratar `ProducerFencedException`.

## Checklist de domínio

- [ ] Configuro exactly-once em produtor e Streams.
- [ ] Entendo offsets na transação.
- [ ] Sei o que fica fora da garantia.
- [ ] Trato fencing e abort.
- [ ] Meço custo de latência.

## Para ir além

Leia o artigo de exactly-once da Confluent e a documentação de transações do Kafka. Depois simule falha no meio do lote e prove que não há duplicata.
