> **Em uma frase:** o estado de uma aplicação Kafka Streams é local, mas não é descartável: ele é reconstruído a partir de um changelog, e o tempo de restauração é uma decisão de arquitetura, não um detalhe de infraestrutura.

## O problema

Um agregado de faturamento por cliente precisa sobreviver a restart, deploy e rebalance. Se o estado fica só num `ConcurrentHashMap`, a primeira instância que morre leva o histórico junto. Se fica só no banco externo, cada evento vira uma consulta e o stream deixa de ser stream.

Kafka Streams mantém o estado ao lado do processador, em disco local, e replica cada atualização num tópico de changelog. Na atribuição de uma tarefa, o estado é restaurado do changelog até o offset do checkpoint. Entender esse caminho é o que separa uma topologia que reinicia em segundos de uma que passa 40 minutos restaurando e derruba o cluster.

## Como funciona

Cada operador stateful — `count`, `aggregate`, `reduce`, `join`, `windowedBy` — tem um state store. O default é RocksDB persistente; `Materialized.as("nome")` dá nome ao store e cria o tópico `<application.id>-<nome>-changelog`, compactado. Cada update grava no store local e no changelog. O changelog é a fonte de verdade para restauração; o disco local é cache.

O checkpoint é um arquivo por tarefa com o offset já aplicado. Num shutdown limpo, o Streams faz flush, grava o checkpoint e fecha. Num crash, o checkpoint pode estar atrasado; a restauração reaplica do último offset consistente até o fim do changelog. Quando o estado local está íntegro e o checkpoint alcança o fim do changelog, não há restauração — o processo abre o RocksDB e continua.

`num.standby.replicas=1` mantém uma cópia quente em outra instância. A standby consome o changelog continuamente, mas não processa. Quando assume a tarefa, já tem quase todo o estado e o failover cai de dezenas de minutos para segundos. O custo é disco e rede duplicados para cada tarefa.

```java
import java.util.Properties;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.*;
import org.apache.kafka.streams.kstream.*;
import org.apache.kafka.streams.state.KeyValueStore;

public final class ContaPorCliente {
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put(StreamsConfig.APPLICATION_ID_CONFIG, "conta-v1");
        props.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(StreamsConfig.STATE_DIR_CONFIG, "/var/lib/kafka-streams");
        props.put(StreamsConfig.NUM_STANDBY_REPLICAS_CONFIG, 1);
        props.put(StreamsConfig.COMMIT_INTERVAL_MS_CONFIG, 1_000);

        StreamsBuilder builder = new StreamsBuilder();
        builder.stream("pedidos.v1", Consumed.with(Serdes.String(), Serdes.Long()))
                .groupByKey()
                .count(Materialized.<String, Long,
                                KeyValueStore<org.apache.kafka.common.utils.Bytes, byte[]>>
                                as("conta-por-cliente")
                        .withKeySerde(Serdes.String())
                        .withValueSerde(Serdes.Long())
                        .withCachingEnabled());

        KafkaStreams streams = new KafkaStreams(builder.build(), props);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> streams.close()));
        streams.start();
    }
}
```

O cache do store bufferiza updates e os envia ao changelog no commit — 30 s por default, ou o valor de `commit.interval.ms`. Isso melhora throughput, mas aumenta a janela de perda em caso de crash e atrasa a visibilidade para quem consulta outra instância. Para interactive queries, um commit de 1 s é um meio-termo comum.

Interactive queries leem o store local, não o changelog. Se a chave não pertence à tarefa hospedada naquela instância, o `get` retorna `null` — indistinguível de “não existe”. Em produção, roteie pelo metadata da chave ou aceite consultar uma réplica com `enableStaleStores()` e trate o resultado como possivelmente atrasado.

```java
import org.apache.kafka.streams.KafkaStreams;
import org.apache.kafka.streams.StoreQueryParameters;
import org.apache.kafka.streams.state.QueryableStoreTypes;
import org.apache.kafka.streams.state.ReadOnlyKeyValueStore;

public final class ConsultaDeSaldo {
    private final KafkaStreams streams;

    public ConsultaDeSaldo(KafkaStreams streams) {
        this.streams = streams;
    }

    public long saldo(String cliente) {
        try {
            ReadOnlyKeyValueStore<String, Long> store = streams.store(
                    StoreQueryParameters.fromNameAndType("conta-por-cliente",
                            QueryableStoreTypes.keyValueStore()));
            Long valor = store.get(cliente);
            return valor == null ? 0L : valor;
        } catch (IllegalStateException e) {
            // instância restaurando ou sem a tarefa local: route para outra
            throw new IllegalStateException("store indisponível", e);
        }
    }
}
```

## Na prática

Dimensione o estado antes do disco. Um store de 100 GB com restauração a 50 MB/s leva cerca de 33 minutos; com três instâncias restaurando ao mesmo tempo, o broker e a rede sofrem juntos. Standby reduz o failover, mas não elimina a restauração inicial de um cluster novo. Monitore o tempo de restore e o tamanho do changelog como SLO.

`state.dir` precisa estar em disco persistente e rápido, separado dos logs do Kafka. O default `/tmp/kafka-streams` é um clássico: em container com filesystem efêmero, todo deploy restaura do zero. Se o estado é grande demais para o disco local, o problema não é Kafka Streams — é o modelo de dados.

## Armadilhas comuns

- **Cardinalidade sem limite.** Uma chave por dispositivo ou por sessão faz o store crescer para sempre.
- **Renomear o store.** O changelog antigo deixa de ser encontrado e o estado nasce vazio.
- **Desligar logging sem standby.** Um restart perde o estado e não há de onde reconstruí-lo.
- **Consultar IQ em qualquer instância.** A chave pode não estar ali; o `null` mente.
- **Ignorar o restore no deploy.** Três réplicas reiniciando juntas saturam o cluster.

## Checklist de domínio

- [ ] Você explica a diferença entre disco local, changelog e checkpoint
- [ ] Você calcula o tempo de restauração a partir do tamanho e da banda
- [ ] Você configura standby e sabe o custo de disco dela
- [ ] Você trata `InvalidStateStoreException` e roteia interactive queries
- [ ] Você sabe quando o estado deve sair do Streams e ir para um banco

## Para ir além

- [Apache Kafka — State Stores](https://kafka.apache.org/documentation/streams/developer-guide/processor-api.html)
- [Apache Kafka — Streams Architecture](https://kafka.apache.org/documentation/streams/architecture)
- [Apache Kafka — Interactive Queries](https://kafka.apache.org/documentation/streams/developer-guide/interactive-queries.html)
- [Confluent — Interactive Queries](https://docs.confluent.io/platform/current/streams/developer-guide/interactive-queries.html)
