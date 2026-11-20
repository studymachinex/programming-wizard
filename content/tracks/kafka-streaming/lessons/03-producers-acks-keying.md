> **Em uma frase:** o produtor é um acumulador de lotes com uma thread de envio; a key decide a partição, e dessa decisão nascem ordem, paralelismo e hotspots.

## O problema

O código de produção mais comum é um `producer.send(record)` dentro de um laço, sem callback, com as configurações padrão. Ele funciona no laptop e falha em produção de três formas silenciosas: mensagens somem quando um broker reinicia (`acks=1`), eventos da mesma entidade chegam fora de ordem depois de um retry, e o throughput não sobe porque cada `send` espera metadata e cria um lote de um único registro.

O produtor não é um cliente HTTP que envia e esquece: ele serializa, escolhe a partição, acumula registros e deixa uma thread de I/O agrupar tudo em requisições. Entender esse pipeline separa "configurei acks=all" de "sei o que acontece quando o líder cai no meio do lote".

## Como funciona

O caminho de um `send` é:

1. **Serialização.** Key e value viram bytes. Um serializer que lança exceção no `send` falha antes de entrar na fila.
2. **Particionamento.** Com key não nula, o partitioner padrão calcula `murmur2(keyBytes)` e usa módulo o número de partições. Sem key, o produtor usa um partitioner sticky: escolhe uma partição e enche o lote antes de trocar, o que melhora a compressão.
3. **Accumulator.** O registro entra em um buffer da partição, limitado por `buffer.memory` (32 MB por padrão). Se o buffer enche, `send` bloqueia até `max.block.ms` (60 s) e então lança `TimeoutException`.
4. **Sender.** Uma thread por produtor drena os lotes respeitando `batch.size` e `linger.ms`, comprime e envia ao líder da partição.
5. **Ack e retry.** O líder responde. Se a resposta falhar de forma retriável, o lote volta para a fila; `delivery.timeout.ms` limita o tempo total, incluindo retries.

As três configurações de confirmação mudam o contrato:

| acks | O produtor considera sucesso quando | Falha do líder logo após o ack | Uso típico |
| --- | --- | --- | --- |
| 0 | Nem espera resposta | Pode perder sem saber | Métricas descartáveis |
| 1 | O líder gravou | Pode perder se o líder cair antes da réplica | Baixo valor, latência mínima |
| all | Todas as réplicas do ISR gravaram | Não perde, se `min.insync.replicas` >= 2 | Pedidos, pagamentos, auditoria |

`acks=all` sozinho não basta. Se `min.insync.replicas=1` e o ISR tem só o líder, "all" é o líder. Se `unclean.leader.election.enable=true`, uma réplica atrasada pode assumir e perder o que não replicou.

Ordem é uma garantia por partição, e ela depende de retries. Sem idempotência, um lote que falhou pode ser reenviado depois de outro lote posterior, invertendo a ordem. Com `enable.idempotence=true`, o produtor anexa um producer id e um sequence number por partição; o broker descarta duplicatas e rejeita sequências fora de ordem. É por isso que, com idempotência, `max.in.flight.requests.per.connection=5` é seguro — o padrão moderno.

```java
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Properties;
import java.util.UUID;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;

public final class PublicarPedido {
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, "true");
        props.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, "5");
        props.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, "120000");
        props.put(ProducerConfig.LINGER_MS_CONFIG, "10");
        props.put(ProducerConfig.BATCH_SIZE_CONFIG, "65536");
        props.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "lz4");

        try (KafkaProducer<String, String> producer = new KafkaProducer<>(props)) {
            String orderId = "ord-94821";
            String payload = "{\"orderId\":\"" + orderId + "\",\"status\":\"CREATED\"}";
            ProducerRecord<String, String> record =
                    new ProducerRecord<>("orders.events", orderId, payload);
            record.headers()
                    .add("event-id", UUID.randomUUID().toString().getBytes(StandardCharsets.UTF_8))
                    .add("schema-version", "3".getBytes(StandardCharsets.UTF_8));

            producer.send(record, (metadata, error) -> {
                if (error != null) {
                    System.err.printf("falha ao publicar %s: %s%n", orderId, error.getMessage());
                } else {
                    System.out.printf("ok partition=%d offset=%d%n",
                            metadata.partition(), metadata.offset());
                }
            });
            producer.flush();
        }
    }
}
```

`send` retorna um `Future`, mas o callback é o caminho idiomático: não bloqueia a thread de negócio e ainda expõe a falha. Chamar `get()` a cada evento transforma o produtor em cliente síncrono e derruba o throughput. `flush()` no fim é correto para job batch; em serviço web, feche o produtor no shutdown e deixe o accumulator drenar.

A key é a decisão de arquitetura mais importante. `orderId` garante ordem do ciclo de vida de um pedido. `customerId` garante ordem de todos os pedidos do cliente, mas concentra clientes grandes. `tenantId` cria hot partition se um tenant é 40% do tráfego.

```java
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import org.apache.kafka.common.utils.Utils;

public final class AnaliseDeHotKey {
    public static void main(String[] args) {
        int particoes = 24;
        Map<Integer, Integer> porParticao = new HashMap<>();

        // Simula 100 mil pedidos: 70% de um único cliente corporativo.
        for (int i = 0; i < 100_000; i++) {
            String customer = i < 70_000 ? "cliente-vip" : "cliente-" + (i % 5_000);
            String key = customer + ":" + i; // ordem por cliente, mas concentra o VIP
            int p = Math.floorMod(Utils.toPositive(Utils.murmur2(key.getBytes(StandardCharsets.UTF_8))), particoes);
            porParticao.merge(p, 1, Integer::sum);
        }

        int maior = porParticao.values().stream().mapToInt(Integer::intValue).max().orElse(0);
        double media = 100_000.0 / particoes;
        System.out.printf("média=%.0f maior=%d desvio=%.1fx%n", media, maior, maior / media);
        // Saída esperada: um único VIP domina a partição e o desvio passa de 10x.
    }
}
```

Esse cálculo mostra o problema antes de virar lag. A correção não é espalhar a key do VIP sem critério: se a ordem por cliente é requisito, use key composta com bucket ou tópico dedicado. Ordem e distribuição são objetivos concorrentes.

## Na prática

Um produtor de pedidos bem ajustado usa `acks=all`, idempotência, compressão `lz4` ou `zstd`, `linger.ms` entre 5 e 20 ms e `batch.size` de 64 KB. Com 2 MB/s e eventos de 500 bytes, isso produz lotes de centenas de registros e reduz o overhead de requisição a uma fração. Os 10 ms são irrelevantes para um checkout, mas inaceitáveis para um leilão.

`buffer.memory` é por produtor, não por partição. Um serviço com 200 partições e 32 MB de buffer pode bloquear em picos se o broker ficar lento. Monitore `buffer-exhausted-rate` e `record-queue-time-avg`. Se o buffer esgota, o problema é o broker ou a rede, não o tamanho do buffer.

## Armadilhas comuns

- **`acks=1` com retenção curta.** A réplica pode não ter o registro quando o líder morre; o produtor já recebeu sucesso.
- **Retries sem idempotência.** A duplicata é silenciosa e só aparece no consumidor, como um pedido criado duas vezes.
- **Usar `null` key em eventos de entidade.** Sem key, o sticky partitioner espalha; você perde ordem e joins por chave.
- **`linger.ms=0` com `batch.size` pequeno.** O produtor envia lotes de um registro e paga round-trip por evento.
- **Ignorar o callback.** O `send` só falha na chamada para erros de serialização/buffer; erros de broker chegam depois, no callback.

## Checklist de domínio

- [ ] Você desenha o caminho de um `send` até o ack e sabe onde cada timeout atua
- [ ] Você escolhe key, partições e partição customizada com critério de ordem e skew
- [ ] Você explica por que idempotência permite `max.in.flight=5`
- [ ] Você calcula o efeito de linger e batch no throughput e na latência
- [ ] Você reconhece duplicata e reordenação por configuração de produtor

## Para ir além

- [Kafka Documentation — Producer Configs](https://kafka.apache.org/documentation/#producerconfigs)
- [Confluent — Kafka Producer Configuration Reference](https://docs.confluent.io/platform/current/installation/configuration/producer-configs.html)
- [Kafka Documentation — Design: The Producer](https://kafka.apache.org/documentation/#theproducer)
- [Confluent Developer — Producers](https://developer.confluent.io/courses/apache-kafka/producers/)
