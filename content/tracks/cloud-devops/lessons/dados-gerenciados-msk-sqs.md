> **Em uma frase:** MSK e SQS resolvem problemas diferentes — MSK é um log particionado que você ainda opera; SQS é uma fila gerenciada com semântica mais simples.

Escolher entre Kafka gerenciado e fila SQS não é questão de moda. Kafka brilha quando vários consumidores precisam reler o mesmo stream, manter ordem por chave e processar em janelas. SQS brilha quando você quer desacoplar produtor e consumidor com baixa operação e não precisa de replay.

## O problema

Um sistema de pedidos publica eventos que três serviços consomem: faturamento, estoque e analytics. Cada um tem ritmo próprio e pode precisar reprocessar. Uma fila simples entrega cada mensagem a um consumidor e apaga após o ACK; não serve para fan-out com replay. Já para enviar e-mails, uma fila simples é suficiente e muito mais barata.

## Como funciona

**MSK:** brokers gerenciados, mas você escolhe partições, replication factor, retenção e capacidade. Acesso via IAM ou SCRAM/TLS. Consumers mantêm offsets; o log retém independentemente do consumo.

```java
var props = new Properties();
props.put("bootstrap.servers", brokers);
props.put("key.serializer", StringSerializer.class.getName());
props.put("value.serializer", StringSerializer.class.getName());
props.put("acks", "all");
props.put("enable.idempotence", "true");
props.put("security.protocol", "SASL_SSL");
props.put("sasl.mechanism", "AWS_MSK_IAM");
props.put("sasl.jaas.config",
    "software.amazon.msk.auth.iam.IAMLoginModule required;");

try (var producer = new KafkaProducer<String, String>(props)) {
    producer.send(new ProducerRecord<>("pedidos", pedido.id(), json));
}
```

**SQS:** standard oferece throughput quase ilimitado e at-least-once; FIFO oferece ordem e exactly-once por message group, com limite de throughput. Visibility timeout define quanto tempo a mensagem fica invisível após a leitura; se o consumidor falhar, ela reaparece.

```java
var sqs = SqsClient.builder().region(Region.US_EAST_1).build();
var resposta = sqs.receiveMessage(ReceiveMessageRequest.builder()
    .queueUrl(queueUrl)
    .maxNumberOfMessages(10)
    .waitTimeSeconds(20)          // long polling
    .visibilityTimeout(30)
    .build());

for (var msg : resposta.messages()) {
    processar(msg.body());
    sqs.deleteMessage(b -> b.queueUrl(queueUrl).receiptHandle(msg.receiptHandle()));
}
```

## Na prática

Dimensione MSK por throughput e retenção: 3 AZs, replication factor 3, partições suficientes para paralelismo. SQS exige DLQ (`maxReceiveCount`) e idempotência, porque duplicatas existem.

Custo: MSK tem custo fixo por broker e armazenamento; SQS cobra por requisição. Para volumes baixos e desacoplamento simples, SQS vence. Para event streaming com replay, MSK.

## Armadilhas comuns

- SQS standard esperando ordem global.
- Visibility timeout menor que o processamento: mensagem duplicada em paralelo.
- MSK com partições de menos e consumidores ociosos.
- Não configurar DLQ.
- Ignorar custo de NAT e transferência entre AZs.

## Checklist de domínio

- [ ] Comparo MSK e SQS por requisito, não por popularidade.
- [ ] Sei configurar IAM no MSK e long polling no SQS.
- [ ] Entendo visibility timeout e DLQ.
- [ ] Dimensiono partições e retenção.
- [ ] Estimo custo dos dois.

## Para ir além

Leia os guias de MSK e SQS da AWS. Depois implemente o mesmo fluxo nos dois e compare replay, ordem e custo.
