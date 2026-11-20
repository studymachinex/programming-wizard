> **Em uma frase:** compatibilidade de schema é uma decisão de ordem de deploy, e toda mensagem que não desserializa precisa de um caminho de retry e DLQ que não trave a partição.

## O problema

Sexta-feira, 19h. O produtor de `pedidos.v1` passa a enviar `cupomId` como obrigatório. O consumidor antigo não tem esse campo no reader schema. O Registry aceitou porque o sujeito estava em `BACKWARD`, mas o time publicou o produtor antes dos consumidores e o default era `null` num campo que o código desreferencia. Resultado: `NullPointerException` em cada mensagem, retry infinito e a partição parada.

É um problema de contrato. O schema define o que pode ser aceito; a DLQ define o que fazer com o que falhou depois de aceito.

## Como funciona

O Schema Registry guarda schemas por *subject* — normalmente `<tópico>-value` — e devolve um id global. O produtor envia um byte mágico `0x00`, quatro bytes big-endian com o id e o payload. O consumidor lê o id, busca o writer schema (com cache local) e resolve contra o reader schema. O Registry sai do caminho quente após o primeiro fetch, mas continua sendo um SPOF de deploy.

| Modo | O que garante | Ordem segura |
| --- | --- | --- |
| `BACKWARD` | schema novo lê dados antigos | consumidores antes |
| `FORWARD` | schema antigo lê dados novos | produtores antes |
| `FULL` | as duas direções | qualquer ordem |
| `NONE` | nada | não use em produção |

`BACKWARD` é o default. Adicionar campo com default é compatível; remover campo é backward-compatible, mas não forward se o campo antigo não tinha default. Renomear é remover + adicionar: quebra as duas direções. A regra prática: só adicione campos opcionais com default, nunca torne um campo opcional em obrigatório, e versione o tipo do evento (`PedidoCriado.v2`) quando a semântica mudar.

Desligue o auto-registro (`auto.register.schemas=false`) e valide compatibilidade no CI: registrar sozinho em runtime transforma deploy em mutação de contrato.

```java
import java.util.*;
import org.apache.kafka.clients.producer.*;
import org.apache.kafka.common.header.internals.RecordHeader;
import org.apache.kafka.common.serialization.StringSerializer;

public final class PublicadorComContrato {
    public static void main(String[] args) throws Exception {
        Properties props = new Properties();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, "true");

        try (Producer<String, String> producer = new KafkaProducer<>(props)) {
            ProducerRecord<String, String> record = new ProducerRecord<>(
                    "pedidos.v1", "p-42", "{\"pedidoId\":\"p-42\",\"totalCentavos\":12990}");
            record.headers()
                    .add(new RecordHeader("event-id", UUID.randomUUID().toString().getBytes()))
                    .add(new RecordHeader("schema-version", "3".getBytes()));
            producer.send(record).get(); // falha alto em vez de perder o evento
        }
    }
}
```

Retry no mesmo offset com `seek` e `sleep` segura a partição e bloqueia mensagens válidas atrás do poison pill. O padrão é encaminhar para tópicos de retry com backoff e, após N tentativas, para uma DLQ. Cada retry é um tópico normal, com a mesma key para preservar ordem por agregado.

```java
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.clients.producer.*;
import org.apache.kafka.common.header.internals.RecordHeader;
import org.apache.kafka.common.serialization.*;

public final class ConsumidorComRetryEDlq {
    private static final int MAX_TENTATIVAS = 3;
    private static final List<Long> BACKOFF_MS = List.of(5_000L, 60_000L, 600_000L);

    public static void main(String[] args) throws Exception {
        Properties cp = new Properties();
        cp.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        cp.put(ConsumerConfig.GROUP_ID_CONFIG, "faturamento-v1");
        cp.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        cp.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        cp.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");

        Properties pp = new Properties();
        pp.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        pp.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        pp.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        pp.put(ProducerConfig.ACKS_CONFIG, "all");

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(cp);
             Producer<String, String> producer = new KafkaProducer<>(pp)) {
            consumer.subscribe(List.of("pedidos.v1"));
            while (true) {
                ConsumerRecords<String, String> lote = consumer.poll(Duration.ofMillis(500));
                for (ConsumerRecord<String, String> r : lote) {
                    int tentativa = tentativa(r);
                    try {
                        processar(r);
                    } catch (RuntimeException e) {
                        String destino = tentativa >= MAX_TENTATIVAS
                                ? "pedidos.dlq" : "pedidos.retry." + (tentativa + 1);
                        ProducerRecord<String, String> saida = new ProducerRecord<>(destino, r.key(), r.value());
                        saida.headers()
                                .add(new RecordHeader("event-id", header(r, "event-id")))
                                .add(new RecordHeader("tentativa", String.valueOf(tentativa + 1).getBytes()))
                                .add(new RecordHeader("erro", e.getClass().getSimpleName().getBytes()))
                                .add(new RecordHeader("origem", (r.topic() + ":" + r.partition() + ":" + r.offset()).getBytes()))
                                .add(new RecordHeader("proxima-tentativa", String.valueOf(
                                        System.currentTimeMillis() + BACKOFF_MS.get(Math.min(tentativa, 2))).getBytes()));
                        producer.send(saida).get(); // confirma antes de commitar o offset
                    }
                }
                consumer.commitSync(); // avança mesmo após DLQ: o poison pill não bloqueia a partição
            }
        }
    }

    private static int tentativa(ConsumerRecord<String, String> r) {
        var h = r.headers().lastHeader("tentativa");
        return h == null ? 0 : Integer.parseInt(new String(h.value(), StandardCharsets.UTF_8));
    }

    private static byte[] header(ConsumerRecord<String, String> r, String nome) {
        var h = r.headers().lastHeader(nome);
        return h == null ? new byte[0] : h.value();
    }

    private static void processar(ConsumerRecord<String, String> r) {
        if (r.value() == null || r.value().isBlank()) throw new IllegalArgumentException("payload vazio");
        // validação contra o schema e regra de negócio
    }
}
```

O `commitSync` depois do encaminhamento é o ponto sutil: a mensagem avança mesmo tendo falhado. Se o processo morrer entre o `send` e o commit, o retry duplica; dedup por `event-id` resolve. A DLQ precisa carregar tópico, partição, offset, exceção, tentativa e timestamp: sem isso, o replay é adivinhação.

## Na prática

Use backoff progressivo: 5 s, 1 min, 10 min, depois DLQ. Erro de negócio permanente (schema inválido, campo obrigatório ausente) vai direto para a DLQ e alerta; erro transitório (timeout, 503) merece backoff. Separe os dois com exceções tipadas.

Retention de 14 a 30 dias e replay idempotente, por lote e com rate limit. Alerta saudável: DLQ > 0 por 5 minutos em erro permanente, ou crescimento acima de 1% do volume por 15 minutos.

## Armadilhas comuns

- **Publicar produtor antes do consumidor em `BACKWARD`.** O schema aceita, o código antigo não.
- **Campo novo obrigatório sem default.** Quebra a leitura de dados antigos.
- **Retry infinito no mesmo offset.** A partição para e o lag cresce sem limite.
- **DLQ só com o payload.** Sem origem e erro, não há replay confiável.

## Checklist de domínio

- [ ] Você explica `BACKWARD`, `FORWARD` e `FULL` com um exemplo de campo
- [ ] Você sabe onde o schema id viaja e por que o Registry não está no caminho quente
- [ ] Você desenha retry com backoff e DLQ sem bloquear a partição
- [ ] Você inclui metadados suficientes para replay

## Para ir além

- [Confluent — Schema Evolution and Compatibility](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html)
- [Apache Kafka — Delivery Semantics](https://kafka.apache.org/documentation/#semantics)
- [Confluent — Serializers and Wire Format](https://docs.confluent.io/platform/current/schema-registry/fundamentals/serdes-develop/index.html)
