> **Em uma frase:** exactly-once no Kafka é uma transação que grava dados, offsets e marcadores de commit de forma atômica; fora do Kafka, você ainda precisa de idempotência.

## O problema

Um serviço de pagamento consome `PaymentRequested`, chama o adquirente e grava o resultado. O consumidor usa at-least-once, então uma falha após a chamada e antes do commit faz o evento voltar. A segunda execução cobra o cliente de novo. O time então "resolve" com exactly-once: liga `enable.idempotence` no produtor, troca o commit para manual e considera o problema encerrado. Mas a chamada HTTP ao adquirente continua fora de qualquer transação.

Garantia de entrega não é um botão. É um contrato que vale para um escopo: um trecho Kafka-to-Kafka, uma escrita no banco, uma chamada externa. Confundir o escopo é como achar que fechar a porta de casa protege o carro na rua.

## Como funciona

Existem três modelos:

| Modelo | Como é obtido | Falha típica | Exemplo |
| --- | --- | --- | --- |
| At-most-once | Commit antes de processar | Perde evento | Métricas e logs |
| At-least-once | Commit depois de processar | Duplica em retry/rebalance | Pedidos, e-mail |
| Exactly-once | Transação Kafka + idempotência | Duplica em efeito externo | Saldo, faturamento |

O exactly-once do Kafka combina duas peças. A primeira é o **produtor idempotente**: producer id + sequence number por partição fazem o broker descartar reenvios. A segunda é a **transação**: o produtor escreve em várias partições e, na mesma transação, envia os offsets do consumidor via `sendOffsetsToTransaction`. O broker grava um marcador de commit; consumidores com `isolation.level=read_committed` só enxergam os registros depois desse marcador e ignoram transações abortadas.

O coordenador de transação gerencia o `transactional.id`. Cada instância lógica usa um id estável. Quando uma instância nova inicia com o mesmo id, o coordenador incrementa o epoch e a instância antiga passa a receber `ProducerFencedException` em qualquer escrita. Isso resolve o produtor zumbi que voltou de uma pausa longa e tentaria gravar por cima da nova.

Os limites importam tanto quanto a garantia:

- A transação cobre tópicos e offsets do Kafka. Um `INSERT` em PostgreSQL ou um `POST` em outro serviço não participa.
- `transaction.timeout.ms` (60 s por padrão, máximo typically 15 min) aborta transações longas. Processamento demorado dentro da transação é uma armadilha.
- O consumidor `read_committed` espera o LSO. Uma transação aberta por muito tempo atrasa a visibilidade para todos os consumidores daquela partição.
- O custo existe: marcadores, coordenação e menos paralelismo efetivo. Não ligue EOS em um pipeline de métricas.

```java
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;

public final class EnriquecerComTransacao {
    public static void main(String[] args) {
        Properties consumerProps = new Properties();
        consumerProps.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        consumerProps.put(ConsumerConfig.GROUP_ID_CONFIG, "orders-enricher");
        consumerProps.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        consumerProps.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        consumerProps.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");
        consumerProps.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed");

        Properties producerProps = new Properties();
        producerProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        producerProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        producerProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        producerProps.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, "true");
        producerProps.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "orders-enricher-1");

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(consumerProps);
             KafkaProducer<String, String> producer = new KafkaProducer<>(producerProps)) {

            producer.initTransactions();
            consumer.subscribe(List.of("orders.raw"));

            while (true) {
                var lote = consumer.poll(Duration.ofMillis(500));
                if (lote.isEmpty()) continue;

                producer.beginTransaction();
                try {
                    for (var registro : lote) {
                        producer.send(new ProducerRecord<>("orders.enriched", registro.key(),
                                enriquecer(registro.value())));
                    }

                    Map<TopicPartition, OffsetAndMetadata> offsets = new HashMap<>();
                    for (var registro : lote) {
                        offsets.put(new TopicPartition(registro.topic(), registro.partition()),
                                new OffsetAndMetadata(registro.offset() + 1));
                    }
                    producer.sendOffsetsToTransaction(offsets, consumer.groupMetadata());
                    producer.commitTransaction();
                } catch (RuntimeException e) {
                    producer.abortTransaction();
                    throw e;
                }
            }
        }
    }

    private static String enriquecer(String payload) {
        return payload.replace("\"status\":\"CREATED\"", "\"status\":\"VALIDATED\"");
    }
}
```

Repare: o commit do offset vai na mesma transação da saída. Se o `send` falhar, o offset não avança e o lote é reprocessado. Se o processo morrer depois do commit, o offset já está gravado. A janela de duplicação no Kafka fecha.

Agora o efeito externo. A transação Kafka não cobre o banco, então a deduplicação precisa ser local e atômica com o efeito. A forma mais confiável é uma constraint unique no banco, não um cache em memória.

```java
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;

public final class ConsumidorIdempotente {
    public void processar(Connection conexao, String eventId, String consumerGroup, Runnable efeito)
            throws SQLException {
        conexao.setAutoCommit(false);
        try {
            String sql = """
                    INSERT INTO processed_events (event_id, consumer_group, processed_at)
                    VALUES (?, ?, now())
                    ON CONFLICT (event_id, consumer_group) DO NOTHING
                    """;
            try (PreparedStatement insert = conexao.prepareStatement(sql)) {
                insert.setString(1, eventId);
                insert.setString(2, consumerGroup);
                if (insert.executeUpdate() == 0) {
                    conexao.rollback(); // já processado: não repete o efeito
                    return;
                }
            }
            efeito.run(); // mesma transação do registro de deduplicação
            conexao.commit();
        } catch (RuntimeException | SQLException e) {
            conexao.rollback();
            throw e;
        } finally {
            conexao.setAutoCommit(true);
        }
    }
}
```

Duas sutilezas. Primeiro, a chave de deduplicação deve ser o `event_id` do produtor, não o offset: offsets mudam se o evento for republicado em outro tópico. Segundo, se o efeito for uma chamada HTTP, o banco não consegue desfazê-la. Nesse caso, o registro de idempotência deve ser enviado ao serviço externo como chave, e ele precisa aplicá-la. Não existe mágica.

## Na prática

Escolha a garantia por valor do dado. Telemetria e métricas agregadas aceitam at-most-once; um evento perdido não muda a decisão. E-mail e notificação aceitam at-least-once com deduplicação simples. Dinheiro, estoque e faturamento exigem EOS no trecho Kafka e idempotência no efeito externo.

O custo do EOS aparece em três lugares: latência (o consumidor read_committed espera o marcador), throughput (menos lotes em voo por transação) e operação (transações abertas, timeouts, fencing). Meça antes de ligar em um pipeline que já está no limite. Em muitos casos, at-least-once com uma constraint unique bem colocada entrega o mesmo resultado de negócio com menos complexidade.

## Armadilhas comuns

- **Achar que EOS cobre o banco.** A transação termina no Kafka. O commit do banco é outro evento e pode falhar.
- **Usar `read_uncommitted` e esperar não ver lixo.** Você vê registros de transações abortadas. A garantia exige `read_committed`.
- **Duas instâncias com o mesmo `transactional.id`.** A segunda faz fencing na primeira; é o comportamento correto, mas derruba a instância antiga se o id não for por instância.
- **Processamento longo dentro da transação.** Estoura `transaction.timeout.ms`, aborta e reprocessa; o efeito externo já pode ter acontecido.
- **Deduplicar por offset.** Um replay em outro tópico ou uma republicação muda o offset e a deduplicação falha.

## Checklist de domínio

- [ ] Você explica a diferença entre idempotência de produtor e transação
- [ ] Você implementa consume-transform-produce com offset na transação
- [ ] Você sabe onde a garantia termina e como deduplicar o efeito externo
- [ ] Você justifica quando at-least-once com idempotência é melhor que EOS
- [ ] Você reconhece `ProducerFencedException`, LSO e transação abortada

## Para ir além

- [Kafka Documentation — Transactions](https://kafka.apache.org/documentation/#transactions)
- [Confluent — Exactly-once Semantics in Apache Kafka](https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/)
- [KIP-98: Exactly Once Delivery and Transactional Messaging](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging)
- [microservices.io — Idempotent Consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html)
