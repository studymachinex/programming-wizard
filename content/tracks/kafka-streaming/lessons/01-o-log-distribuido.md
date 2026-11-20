> **Em uma frase:** Kafka é um log append-only replicado e particionado; tudo o que ele faz bem nasce de escrever em sequência, ler em sequência e deixar cada consumidor escolher onde está no arquivo.

## O problema

Em uma fila tradicional, o broker entrega a mensagem e a remove depois do ack. Isso funciona para tarefas: um job de envio de e-mail não precisa ser lido por dois serviços nem reprocessado depois de um bug. Mas considere um marketplace. O mesmo `OrderPlaced` precisa alimentar fraude, estoque, notificação e data lake. Com uma fila, você cria uma cópia por consumidor — e, quando o serviço de fraude descobre um bug, os eventos já foram apagados. Não há replay.

Sistemas event-driven precisam de um histórico durável, ordenado e barato de ler em escala. Por que um arquivo com offsets aguenta milhões de eventos por segundo quando bancos e filas sofrem com o mesmo volume?

## Como funciona

Um tópico é dividido em partições. Cada partição é um log append-only, dividido em segmentos de arquivo. O produtor acrescenta bytes ao final do segmento ativo e recebe um offset: a posição daquele registro na partição. O consumidor não remove nada; ele guarda o próximo offset que quer ler.

Três propriedades explicam a performance:

1. **Escrita sequencial.** O disco recebe appends no fim do arquivo, sem busca aleatória.
2. **Page cache.** O log vive no cache do sistema operacional; consumidor em dia é servido da memória, sem tocar no disco.
3. **Zero-copy.** O broker envia bytes do page cache ao socket com `sendfile`, sem cópia para o espaço do usuário: menos CPU, mais vazão.

As réplicas são consumidores especiais: o líder envia o log e os seguidores confirmam. O conjunto em dia é o ISR; se o líder cai, um seguidor assume. Fator de replicação maior não aumenta vazão de leitura, só durabilidade e custo de rede.

| Aspecto | Fila tradicional | Log Kafka | Consequência |
| --- | --- | --- | --- |
| Após o consumo | Mensagem removida | Permanece até a retenção | Vários consumidores e replay |
| Ordem | Por mensagem ou fila | Por partição | Paralelismo com ordem local |
| Escala de leitura | Compete pelo mesmo recurso | Cada grupo tem offset próprio | Leitores independentes |
| Backpressure | Broker empurra | Consumidor faz poll | Ritmo controlado pelo cliente |

A escala vem de particionar: cada partição é uma unidade independente de escrita, leitura, replicação e atribuição. Com 24 partições, há 24 fluxos paralelos; um grupo com 8 instâncias distribui essas partições. Mas a ordem só existe dentro da partição. Se dois eventos da mesma entidade precisam de ordem, eles precisam da mesma key.

O consumidor não é notificado pelo broker: ele faz `poll`, recebe um lote e avança. Isso permite batching e controle de ritmo, mas significa que "atrasado" é uma decisão do cliente, não do servidor.

```java
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public final class AppendOnlyLog implements AutoCloseable {
    private final FileChannel channel;
    private long nextOffset;

    public AppendOnlyLog(Path file) throws IOException {
        this.channel = FileChannel.open(file, StandardOpenOption.CREATE,
                StandardOpenOption.READ, StandardOpenOption.WRITE);
        this.nextOffset = channel.size();
    }

    // Registro: [tamanho em 4 bytes][payload UTF-8]. O offset é o byte inicial.
    public long append(String event) throws IOException {
        byte[] payload = event.getBytes(StandardCharsets.UTF_8);
        ByteBuffer buffer = ByteBuffer.allocate(4 + payload.length)
                .putInt(payload.length).put(payload).flip();
        long position = nextOffset;
        while (buffer.hasRemaining()) position += channel.write(buffer, position);
        long offset = nextOffset;
        nextOffset = position;
        return offset;
    }

    public String read(long offset) throws IOException {
        ByteBuffer header = readFully(offset, 4);
        ByteBuffer body = readFully(offset + 4, header.getInt());
        return new String(body.array(), StandardCharsets.UTF_8);
    }

    private ByteBuffer readFully(long position, int size) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate(size);
        while (buffer.hasRemaining()) {
            if (channel.read(buffer, position + buffer.position()) < 0) {
                throw new IOException("fim do log");
            }
        }
        return buffer.flip();
    }

    @Override public void close() throws IOException { channel.close(); }
}
```

Esse log de brinquedo ignora replicação, segmentação e índices. Mas mostra o essencial: offset é um endereço de byte; ler é posicionar; acrescentar é escrever no fim. O Kafka adiciona um índice esparso offset → posição e outro por timestamp.

O grupo de consumidores dá a semântica de "fila" ao log. Cada grupo tem offsets próprios no tópico interno `__consumer_offsets`; dois grupos leem o mesmo evento sem se atrapalhar.

```java
import java.time.Duration;
import java.util.List;
import java.util.Properties;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;

public final class ReplayDoZero {
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "fraud-detection-v2");
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            consumer.subscribe(List.of("orders.events"));
            consumer.poll(Duration.ZERO); // dispara a atribuição de partições
            consumer.seekToBeginning(consumer.assignment());
            while (true) {
                var records = consumer.poll(Duration.ofMillis(500));
                for (var record : records) {
                    System.out.printf("%d@%d %s%n", record.partition(), record.offset(), record.value());
                }
                if (!records.isEmpty()) consumer.commitSync();
            }
        }
    }
}
```

`seekToBeginning` só funciona depois que o grupo recebe partições. Para reprocessar sem afetar o grupo atual, crie outro `group.id` ou use reset com o grupo parado. Replay não é de graça: se a retenção é de 7 dias e o bug é de 30, o dado não existe mais.

## Na prática

Um cálculo de ordem de grandeza ajuda na decisão. Com 40 MB/s de pico, retenção de 7 dias e RF=3, são 40 × 86.400 ≈ 3,4 TB/dia lógicos, 24 TB em 7 dias e 72 TB com replicação — mais folga para picos e segmentos ainda não apagados. Em 6 brokers, cerca de 12 TB por nó. Operável, mas exige discos dedicados e monitoramento de espaço: Kafka não é cache.

Nem todo problema pede Kafka. SQS ou RabbitMQ é melhor para tarefas com ack individual, prioridade, delay por mensagem e roteamento complexo. Um banco relacional resolve volumes baixos com transação e consulta ad hoc. Kafka brilha quando há múltiplos consumidores independentes, retenção e replay, ou volume que exige paralelismo por partição.

## Armadilhas comuns

- **Tratar Kafka como banco operacional.** Buscar uma mensagem por id exige varrer a partição. Materialize em banco ou use tópico compactado com uma view.
- **Criar poucas partições "para economizar".** Não dá para reduzir, e aumentar quebra o mapeamento de keys existentes. Dimensione pelo pico com margem.
- **Confiar na retenção como garantia de processamento.** Consumidor parado além da retenção perde o offset e o dado. Monitore lag em tempo.
- **Ignorar o page cache.** Reprocessar 2 TB em broker com 64 GB de RAM bate no disco e compete com produtores. Planeje a janela.

## Checklist de domínio

- [ ] Você explica por que o log permite replay e a fila não
- [ ] Você calcula partições e disco para um throughput e uma retenção dados
- [ ] Você identifica quando uma key cria hot partition
- [ ] Você sabe o que acontece com um consumidor 10 dias parado em tópico com 7 dias de retenção
- [ ] Você escolhe entre Kafka, fila e banco para um caso concreto, com trade-offs

## Para ir além

- [Apache Kafka Documentation — Design](https://kafka.apache.org/documentation/#design)
- [The Log: real-time data's unifying abstraction](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)
- [Confluent Developer — Apache Kafka 101](https://developer.confluent.io/courses/apache-kafka/events/)
- [Kafka: a Distributed Messaging System for Log Processing](https://notes.stephenholiday.com/Kafka.pdf)
