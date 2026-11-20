> **Em uma frase:** um tópico não é uma fila nem uma tabela: é um conjunto de logs independentes cujo contrato com o consumidor depende de retenção, compaction e do que o ISR garante.

## O problema

Quase todo incidente de Kafka começa em uma configuração de tópico copiada de outro time. O tópico de pedidos nasce com retenção de 7 dias porque "é o padrão", o consumidor de auditoria fica parado no feriado e, na volta, metade do histórico sumiu. Ou o contrário: alguém coloca retenção infinita em um tópico de cliques, o disco enche e o cluster inteiro fica indisponível. Em outro caso, `min.insync.replicas=1` com `acks=all` parece seguro, mas não protege contra a perda das duas réplicas que estavam fora do ar.

Entender partição, offset, segmento e retenção não é trivia de operador. É o que permite responder: quanto tempo um consumidor pode ficar parado? O que acontece se eu aumentar o número de partições? Posso recuperar o estado de um serviço só com o tópico?

## Como funciona

Cada partição é uma pasta no disco do broker com três arquivos principais: `.log` (os registros), `.index` (offset → posição) e `.timeindex` (timestamp → offset). O log é dividido em segmentos. O segmento ativo recebe escritas; quando atinge `segment.bytes` ou `segment.ms`, é fechado e um novo é aberto. A retenção apaga segmentos inteiros, nunca registros individuais no meio do arquivo — por isso valores pequenos de retenção com segmentos grandes podem manter mais dado do que você espera.

Cada partição tem três marcos:

| Marco | Significado | Uso prático |
| --- | --- | --- |
| Log start offset | Primeiro registro ainda retido | Limite inferior para consumidores |
| High watermark | Até onde as réplicas em sincronia têm o dado | Limite do que o consumidor pode ler |
| Log end offset (LEO) | Próximo offset a ser escrito | Base para medir lag |

O consumidor só lê até a high watermark. Se um registro foi escrito no líder mas ainda não replicou, ele existe no LEO, mas não está visível. `isolation.level=read_committed` adiciona outra barreira: ele também espera o fim da transação, o LSO (last stable offset).

Réplica não é backup. O líder serve leituras e escritas; os seguidores buscam continuamente. Se um seguidor atrasa além de `replica.lag.time.max.ms`, sai do ISR. Com `acks=all` e `min.insync.replicas=2`, o produtor só recebe sucesso se ao menos duas réplicas em sincronia gravaram. Se o ISR cair para uma, o tópico rejeita escrita — prefere indisponibilidade a perda. É um trade-off explícito, e a maioria dos times prefere assim para dados financeiros.

Retenção tem duas políticas. `delete` remove segmentos antigos por tempo ou tamanho. `compact` mantém ao menos o último registro de cada key. Um tópico pode usar as duas: `compact,delete`. Compaction não é imediata nem garante que você verá apenas uma versão por key: ela roda em background, e um consumidor pode ler duplicatas e versões antigas até o segmento ser compactado. A garantia é que a última versão de cada key não será removida, e que a ordem por key é preservada.

```java
import java.util.List;
import java.util.Map;
import java.util.Properties;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.common.config.TopicConfig;

public final class CriarTopicoDePedidos {
    public static void main(String[] args) throws Exception {
        Properties props = new Properties();
        props.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");

        try (AdminClient admin = AdminClient.create(props)) {
            NewTopic pedidos = new NewTopic("orders.events", 24, (short) 3)
                    .configs(Map.of(
                            TopicConfig.CLEANUP_POLICY_CONFIG, "delete",
                            TopicConfig.RETENTION_MS_CONFIG, "604800000",     // 7 dias
                            TopicConfig.RETENTION_BYTES_CONFIG, "107374182400", // 100 GiB
                            TopicConfig.MIN_IN_SYNC_REPLICAS_CONFIG, "2",
                            TopicConfig.SEGMENT_BYTES_CONFIG, "536870912",    // 512 MiB
                            TopicConfig.COMPRESSION_TYPE_CONFIG, "zstd"));

            admin.createTopics(List.of(pedidos)).all().get();
            var descricao = admin.describeTopics(List.of("orders.events")).allTopicNames().get();
            descricao.forEach((nome, t) ->
                    System.out.printf("%s: %d partições, RF=%d%n",
                            nome, t.partitions().size(), t.partitions().get(0).replicas().size()));
        }
    }
}
```

O produtor deve ser configurado em conjunto: `acks=all` sem `min.insync.replicas=2` não impede perda; `min.insync.replicas=2` com `acks=1` também não. E `unclean.leader.election.enable=true` pode eleger uma réplica desatualizada, perdendo dados em troca de disponibilidade. Em dados de pedido, deixe `false`.

Inspecionar offsets é o primeiro passo de qualquer diagnóstico. O código abaixo mostra o intervalo disponível e o offset commitado de uma partição, e reposiciona o consumidor nas últimas mil mensagens.

```java
import java.time.Duration;
import java.util.List;
import java.util.Properties;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;

public final class InspecionarParticao {
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "auditoria");
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());

        TopicPartition tp = new TopicPartition("orders.events", 7);
        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            consumer.assign(List.of(tp));
            long inicio = consumer.beginningOffsets(List.of(tp)).get(tp);
            long fim = consumer.endOffsets(List.of(tp)).get(tp);
            OffsetAndMetadata commitado = consumer.committed(tp);

            System.out.printf("partição 7: [%d, %d) commitado=%s%n",
                    inicio, fim, commitado == null ? "nunca" : commitado.offset());

            long alvo = Math.max(inicio, fim - 1_000);
            consumer.seek(tp, alvo);
            var lote = consumer.poll(Duration.ofSeconds(1));
            System.out.printf("relidos %d registros a partir de %d%n", lote.count(), alvo);
        }
    }
}
```

## Na prática

Para o domínio de pedidos, um desenho comum é `orders.events` com 24 partições, RF=3, `min.insync.replicas=2`, retenção de 14 dias e compactação desligada. A key é `orderId`, garantindo ordem do ciclo de vida daquele pedido. Um segundo tópico, `orders.snapshots`, com `cleanup.policy=compact`, guarda o último estado por pedido para reconstrução rápida de uma projeção. Não tente fazer os dois papéis no mesmo tópico: retenção por tempo e compaction têm propósitos diferentes.

Partições são decididas pelo pico, não pela média. Se cada partição entrega com folga 10 MB/s e o pico é 120 MB/s, 12 partições são o mínimo; 24 dão margem para crescimento e para picos de reprocessamento. Cada partição custa file handles, memória de buffers e tempo de recuperação. Milhares de partições em um cluster pequeno aumentam o tempo de failover e de rebalance.

## Armadilhas comuns

- **Aumentar partições sem Planejar a key.** O hash key → partição muda. Eventos antigos e novos da mesma key podem ficar em partições diferentes, quebrando ordem e joins.
- **`retention.ms=-1` por padrão.** Disco é finito. Mesmo com tiered storage, a cópia local precisa de limite.
- **Esperar compaction imediata.** Ela é assíncrona e pode nunca rodar se o segmento não fechar. Não use compacted topic como leitura de baixa latência sem materializar.
- **`acks=all` com `min.insync.replicas=1`.** Se o líder gravar e cair, você perde o dado mesmo com "all".
- **Apagar e recriar tópico para "limpar".** A exclusão é assíncrona, e recriar com o mesmo nome pode herdar estado indesejado. Prefira expirar via retenção.

## Checklist de domínio

- [ ] Você explica high watermark, LEO e log start offset sem confundir os três
- [ ] Você projeta retenção, segmento e compaction para um caso concreto
- [ ] Você justifica RF e `min.insync.replicas` com o risco aceito
- [ ] Você sabe o efeito de aumentar partições em um tópico com keys existentes
- [ ] Você diagnostica um `OffsetOutOfRange` a partir dos offsets da partição

## Para ir além

- [Kafka Documentation — Topic Configs](https://kafka.apache.org/documentation/#topicconfigs)
- [Kafka Documentation — Log Compaction](https://kafka.apache.org/documentation/#compaction)
- [Confluent — How to Choose the Number of Topics/Partitions](https://www.confluent.io/blog/how-choose-number-topics-partitions-kafka-cluster/)
- [Kafka Documentation — Replication](https://kafka.apache.org/documentation/#replication)
