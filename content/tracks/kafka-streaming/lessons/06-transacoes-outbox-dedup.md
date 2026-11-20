> **Em uma frase:** outbox troca uma escrita atômica entre banco e Kafka por uma escrita atômica local mais publicação repetível — e empurra a deduplicação para o consumidor.

## O problema

O serviço de pedidos precisa fazer duas coisas: gravar o pedido no PostgreSQL e publicar `OrderPlaced` no Kafka. Fazer `commit` e depois `producer.send` deixa uma janela: se o processo morre entre os dois, o pedido existe e o evento não. Fazer o `send` antes e o commit depois cria o inverso: o evento existe e o pedido não. Esse é o dual write, e ele não é resolvido por retry, porque o retry não sabe qual das duas operações falhou.

A solução ingênua — publicar dentro de uma transação Kafka — não funciona: a transação cobre tópicos e offsets do Kafka, não o banco. O outbox resolve o problema transformando a publicação em um efeito derivado de uma transação local que já é atômica.

## Como funciona

A regra é simples: na mesma transação SQL que altera o pedido, insira uma linha na tabela `outbox` descrevendo o evento. Se a transação commitar, o evento está persistido; se falhar, nem pedido nem evento existem. Um processo separado — o relay — lê a outbox e publica no Kafka.

```sql
CREATE TABLE outbox (
    id            BIGSERIAL PRIMARY KEY,
    event_id      UUID NOT NULL UNIQUE,
    aggregate_id  TEXT NOT NULL,
    event_type    TEXT NOT NULL,
    payload       JSONB NOT NULL,
    headers       JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at  TIMESTAMPTZ
);

CREATE INDEX outbox_pendentes ON outbox (id) WHERE published_at IS NULL;
```

O relay pode ser um poller ou CDC. O poller faz `SELECT ... FOR UPDATE SKIP LOCKED`, publica e marca `published_at`. O CDC lê o WAL/binlog com Debezium e publica sem polling. Os dois entregam **ao menos uma vez**: se o relay publica e morre antes de marcar, o evento é publicado de novo. Não existe exactly-once entre banco e Kafka sem coordenação; o consumidor precisa ser idempotente.

| Critério | Poller | CDC |
| --- | --- | --- |
| Latência | Intervalo do poll | Quase tempo real |
| Carga no banco | Consultas periódicas | Leitura contínua do log |
| Complexidade | Baixa | Conector, slot, monitoramento |
| Ordem | Depende do particionamento do relay | Ordem do log por linha |

A ordem é o detalhe que mais morde. `SKIP LOCKED` permite que dois pollers peguem linhas do mesmo agregado e publiquem fora de ordem. Se a ordem por `orderId` importa — e normalmente importa —, o relay precisa serializar por agregado: um único worker por shard de `hash(aggregate_id)`, ou uma coluna de versão e um consumidor que rejeite versões fora de ordem. Publicar com key `aggregate_id` garante ordem dentro da partição, mas não conserta a ordem em que os eventos chegaram ao produtor.

```java
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.UUID;

public final class CriarPedidoComOutbox {
    public void criar(Connection conexao, String orderId, String customerId, long totalCentavos)
            throws SQLException {
        String eventId = UUID.randomUUID().toString();
        String payload = """
                {"orderId":"%s","customerId":"%s","totalCentavos":%d}
                """.formatted(orderId, customerId, totalCentavos).trim();

        conexao.setAutoCommit(false);
        try {
            try (PreparedStatement pedido = conexao.prepareStatement("""
                    INSERT INTO orders (id, customer_id, total_centavos, status)
                    VALUES (?, ?, ?, 'PENDING')
                    """)) {
                pedido.setString(1, orderId);
                pedido.setString(2, customerId);
                pedido.setLong(3, totalCentavos);
                pedido.executeUpdate();
            }

            try (PreparedStatement outbox = conexao.prepareStatement("""
                    INSERT INTO outbox (event_id, aggregate_id, event_type, payload)
                    VALUES (?, ?, 'OrderPlaced', ?::jsonb)
                    """)) {
                outbox.setObject(1, UUID.fromString(eventId));
                outbox.setString(2, orderId);
                outbox.setString(3, payload);
                outbox.executeUpdate();
            }

            conexao.commit(); // pedido e evento commitam juntos
        } catch (SQLException e) {
            conexao.rollback();
            throw e;
        } finally {
            conexao.setAutoCommit(true);
        }
    }
}
```

Agora o relay. O ponto crítico é não marcar como publicado antes do ack do Kafka. Se o `send` for assíncrono e você marcar imediatamente, uma falha posterior perde o evento.

```java
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Duration;
import java.util.Properties;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;

public final class RelayDaOutbox {
    public void publicarLote(Connection conexao, int limite) throws Exception {
        Properties props = new Properties();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, "true");
        props.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, "120000");

        try (KafkaProducer<String, String> producer = new KafkaProducer<>(props)) {
            conexao.setAutoCommit(false);
            try (PreparedStatement select = conexao.prepareStatement("""
                    SELECT id, aggregate_id, event_type, payload::text
                    FROM outbox
                    WHERE published_at IS NULL
                    ORDER BY id
                    LIMIT ?
                    FOR UPDATE SKIP LOCKED
                    """)) {
                select.setInt(1, limite);
                try (ResultSet rs = select.executeQuery()) {
                    while (rs.next()) {
                        long id = rs.getLong("id");
                        String key = rs.getString("aggregate_id");
                        String value = rs.getString("payload");

                        producer.send(new ProducerRecord<>("orders.events", key, value))
                                .get(5, TimeUnit.SECONDS); // confirma antes de marcar

                        try (PreparedStatement update = conexao.prepareStatement(
                                "UPDATE outbox SET published_at = now() WHERE id = ?")) {
                            update.setLong(1, id);
                            update.executeUpdate();
                        }
                    }
                }
                conexao.commit();
            } catch (Exception e) {
                conexao.rollback();
                throw e;
            } finally {
                conexao.setAutoCommit(true);
            }
        }
    }
}
```

Segurar a transação do banco enquanto espera o Kafka não é elegante, mas é honesto: o lock impede outro relay de pegar a mesma linha. Em alto volume, o padrão é marcar `publishing` com um lease, publicar, marcar `published`, e um job varre leases vencidos — assumindo duplicatas. O consumidor tem que estar pronto de qualquer forma.

## Na prática

Deduplicação no consumidor tem três níveis. O mais forte é uma constraint unique em `(event_id, consumer_group)` na mesma transação do efeito. O segundo é um upsert idempotente com versão (`ON CONFLICT ... DO UPDATE ... WHERE excluded.version > current.version`). O terceiro, mais fraco, é um cache de ids com TTL — útil para reduzir carga, nunca como garantia.

A outbox precisa de higiene. Sem purge, a tabela cresce para sempre e o índice fica caro. Apague linhas publicadas com mais de alguns dias, em lotes, fora do horário de pico. Monitore o atraso `now() - min(created_at) WHERE published_at IS NULL`; ele é o lag real da publicação. E monitore o tamanho da tabela, porque um relay parado é um incidente silencioso: a API continua respondendo, mas os eventos não saem.

## Armadilhas comuns

- **Publicar antes do commit.** O evento descreve um pedido que pode ser revertido. Sempre depois do commit, via relay.
- **Marcar `published_at` antes do ack.** Troca duplicata por perda. Espere o `get` ou trate o callback corretamente.
- **Vários pollers sem serialização por agregado.** A ordem por pedido quebra mesmo com key correta no Kafka.
- **Esquecer o purge.** A outbox vira o maior objeto do banco e as consultas degradam.
- **Deduplicar apenas em memória.** Restart, múltiplas instâncias e rebalance invalidam o cache.
- **Achar que o outbox dá exactly-once.** Ele dá pelo menos uma vez com atomicidade local. A dedup é do consumidor.

## Checklist de domínio

- [ ] Você explica por que transação Kafka não resolve dual write com banco
- [ ] Você implementa outbox na mesma transação da regra de negócio
- [ ] Você compara poller e CDC por latência, carga e complexidade
- [ ] Você garante ordem por agregado no relay e no consumo
- [ ] Você projeta dedup com constraint unique e versionamento

## Para ir além

- [microservices.io — Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- [microservices.io — Polling Publisher](https://microservices.io/patterns/data/polling-publisher.html)
- [Debezium — Outbox Event Router](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html)
- [Eventuate Tram — Customers and Orders](https://github.com/eventuate-tram/eventuate-tram-examples-customers-and-orders)
