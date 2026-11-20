> **Em uma frase:** um consumer group é um protocolo de coordenação, não uma fila com trabalhadores; rebalance, heartbeat e `max.poll.interval.ms` definem quando o grupo vive, morre e redistribui trabalho.

## O problema

O sintoma clássico: o lag sobe, você adiciona instâncias ao consumer group e o lag piora. Nos logs, uma sequência de `Rebalance started` a cada 40 segundos. O processamento de cada lote leva 90 segundos, mas `max.poll.interval.ms` está em 60. O coordenador expulsa a instância, redistribui as partições, outra instância pega o mesmo lote pela metade e o ciclo recomeça. Ninguém perdeu dado — o grupo está em at-least-once — mas o sistema não avança.

Consumidor é a parte do Kafka em que a topologia de falha é mais rica. Um produtor errado perde ou duplica eventos; um consumidor errado entra em rebalance storm, bloqueia partições, comete offset cedo demais ou nunca comete. Esta aula cobre o protocolo e o diagnóstico.

## Como funciona

Ao entrar no grupo, o consumidor envia um `JoinGroup` ao coordenador — um broker eleito para aquele `group.id`. O coordenador escolhe um líder entre os membros; o líder recebe a lista de membros e partições e devolve a atribuição. Todos recebem suas partições e começam a buscar do offset commitado.

O membro envia heartbeats em uma thread separada, a cada `heartbeat.interval.ms` (3 s por padrão). Se o coordenador não vê heartbeat por `session.timeout.ms` (45 s), considera o membro morto. Mas há outro relógio: `max.poll.interval.ms` (5 min). Se a thread de aplicação não chama `poll` nesse intervalo, o consumidor é removido mesmo com heartbeat vivo — porque o heartbeat prova que o processo existe, não que o processamento avança.

| Configuração | Padrão | Protege contra | Custo de errar |
| --- | --- | --- | --- |
| `session.timeout.ms` | 45 s | Processo travado ou rede partida | Rebalance desnecessário se muito baixo |
| `heartbeat.interval.ms` | 3 s | Detecção lenta de falha | Heartbeats demais |
| `max.poll.interval.ms` | 5 min | Processamento que não termina | Rebalance storm se menor que o trabalho |
| `max.poll.records` | 500 | Lote grande demais para o tempo | Latência e risco de timeout |

Rebalance tem dois protocolos. No **eager**, todos os membros devolvem todas as partições, o grupo para, e a nova atribuição é distribuída. Simples, mas cada rebalance pausa o consumo. No **cooperative-sticky**, os membros mantêm o que podem e revogam apenas o necessário, em rodadas incrementais. Para grupos grandes, a diferença é a de "segundos de pausa" para "dezenas de segundos".

Três eventos disparam rebalance: entrada/saída de membro, mudança no número de partições do tópico e mudança na subscription. Além disso, o coordenador pode falhar. Você não elimina rebalance; você o torna raro e barato com `group.instance.id` (static membership), protocolo cooperativo e processamento dentro do orçamento de poll.

O lag é `log end offset - committed offset` por partição. Offset lag não é tempo: 100 mil mensagens podem ser 2 segundos em um tópico de 50 mil/s ou 20 minutos em um de 80/s. Para SLO, importa o tempo estimado de recuperação, com taxa de chegada e vazão do consumidor.

```java
import java.time.Duration;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicBoolean;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.consumer.WakeupException;
import org.apache.kafka.common.serialization.StringDeserializer;

public final class ConsumidorComShutdown {
    private static final AtomicBoolean running = new AtomicBoolean(true);

    public static void main(String[] args) {
        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "billing");
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, "200");
        props.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, "300000");
        props.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, "45000");

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                running.set(false);
                consumer.wakeup(); // interrompe o poll bloqueado
            }));

            consumer.subscribe(List.of("orders.events"));
            try {
                while (running.get()) {
                    var lote = consumer.poll(Duration.ofMillis(500));
                    for (var registro : lote) {
                        processar(registro.value());
                    }
                    if (!lote.isEmpty()) {
                        consumer.commitSync(); // só depois de processar o lote inteiro
                    }
                }
            } catch (WakeupException e) {
                if (running.get()) throw e;
            } finally {
                consumer.commitSync(); // último lote já processado
                consumer.close();
            }
        }
    }

    private static void processar(String payload) {
        // Idempotente: o mesmo evento pode chegar duas vezes após um rebalance.
    }
}
```

`wakeup()` é a única operação segura de outra thread. O `poll` lança `WakeupException`, o laço termina e o `finally` fecha o consumidor. Se o processamento de um lote demora, o shutdown espera — por isso o desligamento gracioso precisa de um timeout no orquestrador, não só do `close()`.

Para diagnosticar lag, não confie só no número agregado. O código abaixo calcula o lag por partição e mostra a maior.

```java
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.stream.Collectors;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;

public final class LagPorParticao {
    public static void main(String[] args) throws Exception {
        Properties props = new Properties();
        props.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");

        try (AdminClient admin = AdminClient.create(props)) {
            Map<TopicPartition, OffsetAndMetadata> commitados =
                    admin.listConsumerGroupOffsets("billing").partitionsToOffsetAndMetadata().get();

            Map<TopicPartition, OffsetSpec> fim =
                    commitados.keySet().stream().collect(Collectors.toMap(tp -> tp, tp -> OffsetSpec.latest()));
            Map<TopicPartition, Long> finais = admin.listOffsets(fim).all().get()
                    .entrySet().stream()
                    .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().offset()));

            commitados.forEach((tp, offset) -> {
                long commitado = Math.max(0, offset.offset());
                long lag = Math.max(0, finais.getOrDefault(tp, commitado) - commitado);
                System.out.printf("%s-%d commitado=%d lag=%d%n",
                        tp.topic(), tp.partition(), commitado, lag);
            });
        }
    }
}
```

## Na prática

O paralelismo máximo de um grupo é o número de partições. Com 24 partições, a 25ª instância fica ociosa. Se você precisa de mais concorrência do que partições, processe em pool interno, mas mantenha o `poll` vivo e controle o commit. O padrão seguro: thread de poll busca, enfileira em uma fila limitada, pausa a partição quando a fila enche, e só commita o offset contíguo depois que o processamento confirma. Commitar o maior offset concluído, e não o último recebido, evita pular um registro que ainda está em andamento.

Ajuste `max.poll.records` pelo tempo do lote, não pelo throughput. Se processar 500 registros leva 4 minutos, use 100 e faça mais polls; o overhead é pequeno comparado ao risco de rebalance. Para cargas com picos de GC, `session.timeout.ms` maior e `group.instance.id` reduzem rebalance acidental.

## Armadilhas comuns

- **Processar no thread de poll além do `max.poll.interval.ms`.** O grupo expulsa, redistribui e o trabalho recomeça. É a causa número um de rebalance storm.
- **Commitar antes de processar.** Uma falha no meio do lote perde eventos silenciosamente. Commit depois, sempre.
- **Auto-commit com processamento assíncrono.** O commit automático pode avançar antes do efeito; desligue e controle manualmente.
- **Usar o mesmo `KafkaConsumer` em várias threads.** Não é thread-safe. `wakeup` é a exceção.
- **Achar que mais consumidores resolvem lag.** Acima do número de partições, eles ficam ociosos; abaixo, a partição mais quente limita o grupo.
- **Ignorar o lag de uma partição.** A média esconde a partição travada por poison pill ou hot key.

## Checklist de domínio

- [ ] Você diferencia `session.timeout.ms` de `max.poll.interval.ms` com um exemplo
- [ ] Você explica eager versus cooperative-sticky e o impacto no consumo
- [ ] Você implementa commit após processamento e shutdown com `wakeup`
- [ ] Você calcula lag por partição e estima tempo de recuperação
- [ ] Você reconhece rebalance storm nos logs e sabe a primeira métrica a olhar

## Para ir além

- [Kafka Documentation — Consumer Configs](https://kafka.apache.org/documentation/#consumerconfigs)
- [KIP-429: Incremental Cooperative Rebalancing](https://cwiki.apache.org/confluence/display/KAFKA/KIP-429%3A+Kafka+Consumer+Incremental+Rebalance+Protocol)
- [Confluent — Apache Kafka 101: Consumers](https://developer.confluent.io/courses/apache-kafka/consumers/)
- [Kafka Documentation — Consumer Design](https://kafka.apache.org/documentation/#consumergroup)
