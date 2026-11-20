> **Em uma frase:** KStream é o fato que aconteceu; KTable é o último estado por chave — e a topologia que você escreve é uma escolha sobre onde o estado vive e quanto tráfego extra você aceita pagar.

## O problema

Um serviço de antifraude precisa decidir se libera um pedido comparando o total gasto pelo cliente com o limite cadastrado. Guardar o total num `HashMap` funciona até o primeiro rebalance: a tarefa muda de instância, o mapa morre e o novo dono começa do zero. Consultar o banco a cada pedido adiciona latência e acopla o stream ao schema interno de outro serviço.

Kafka Streams resolve isso com duas abstrações que parecem parecidas no código e são opostas na semântica. Confundir as duas é a origem da maioria das topologias que funcionam em teste e erram em produção.

## Como funciona

`KStream` é uma sequência append-only de fatos independentes. Cada registro existe por si; não há `update` nem `delete` conceitual. `KTable` é um changelog: para cada chave, vale o último valor, e um valor `null` é um tombstone que remove a chave. Uma tabela pode nascer de `builder.table("clientes")`, de um `groupByKey().aggregate(...)` ou de um `stream.toTable()`.

| Operação | O que dispara a saída | Co-particionamento |
| --- | --- | --- |
| `KStream` + `KTable` | novo registro no stream | sim |
| `KTable` + `KTable` | update em qualquer lado | sim |
| `KStream` + `GlobalKTable` | novo registro no stream | não |

O join stream-tabela é um lookup: quando chega um pedido, o Streams consulta a tabela local. Uma atualização na tabela não reescreve resultados já emitidos; ela afeta apenas os próximos registros do stream. Já o join tabela-tabela emite de novo quando qualquer lado muda. O `GlobalKTable` replica a tabela inteira em cada instância: elimina a exigência de co-particionamento, mas custa memória e tempo de restauração proporcionais ao dataset.

O detalhe que mais aparece em incidentes é o `groupBy`. Trocar a chave exige garantir que todos os registros daquela chave caiam na mesma tarefa. O Streams materializa isso num tópico de repartição, que é escrito e lido de novo: um stream de 80 MB/s passa a gerar 160 MB/s de tráfego e alguns milissegundos de latência. `groupByKey` sobre uma chave já correta não reparte; `map` e `selectKey` marcam a topologia como “repartition required”.

```java
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.kstream.*;

public final class TopologiaDePedidos {
    public static void main(String[] args) {
        StreamsBuilder builder = new StreamsBuilder();

        KTable<String, Long> limite = builder.table("clientes.limite",
                Materialized.with(Serdes.String(), Serdes.Long()));

        KTable<String, Long> total = builder.stream("pedidos.v1",
                        Consumed.with(Serdes.String(), Serdes.String()))
                .selectKey((k, v) -> v.split(",")[0]) // nova chave: repartição
                .groupByKey(Grouped.with(Serdes.String(), Serdes.String()))
                .aggregate(() -> 0L,
                        (cliente, pedido, soma) -> soma + Long.parseLong(pedido.split(",")[1]),
                        Materialized.<String, Long,
                                org.apache.kafka.streams.state.KeyValueStore<org.apache.kafka.common.utils.Bytes, byte[]>>
                                as("total-por-cliente")
                                .withKeySerde(Serdes.String())
                                .withValueSerde(Serdes.Long()));

        total.toStream()
                .join(limite, (soma, lim) -> soma > lim ? "BLOQUEAR" : "LIBERAR")
                .to("clientes.status", Produced.with(Serdes.String(), Serdes.String()));

        System.out.println(builder.build().describe());
    }
}
```

`topology.describe()` é o raio-X. Procure por `Source`, `Processor`, `StateStore` e `Sink`; um store aparece como `[total-por-cliente]`, e uma repartição aparece como tópico `<application.id>-...-repartition`. Se o desenho tem um `join` com dois `Source` de partições diferentes, o erro só aparece em runtime, com `TopologyException: Co-partitioning requirement not met`.

```java
import java.util.Properties;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.*;
import org.apache.kafka.streams.kstream.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class TopologiaTest {
    @Test
    void contaPedidosPorCliente() {
        StreamsBuilder builder = new StreamsBuilder();
        builder.stream("pedidos.v1", Consumed.with(Serdes.String(), Serdes.Long()))
                .groupByKey()
                .reduce(Long::sum, Materialized.with(Serdes.String(), Serdes.Long()))
                .toStream()
                .to("totais", Produced.with(Serdes.String(), Serdes.Long()));

        Properties props = new Properties();
        props.put(StreamsConfig.APPLICATION_ID_CONFIG, "teste");
        props.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, "dummy:9092");

        try (TopologyTestDriver driver = new TopologyTestDriver(builder.build(), props)) {
            var entrada = driver.createInputTopic("pedidos.v1",
                    Serdes.String().serializer(), Serdes.Long().serializer());
            var saida = driver.createOutputTopic("totais",
                    Serdes.String().deserializer(), Serdes.Long().deserializer());
            entrada.pipeInput("c-1", 100L);
            entrada.pipeInput("c-1", 50L);
            assertEquals(150L, saida.readValue().longValue());
        }
    }
}
```

## Na prática

Use `KTable` quando a pergunta é “qual é o valor agora?” — saldo, limite, cadastro, última localização. Use `KStream` quando a pergunta é “o que aconteceu, em ordem?” — cliques, transações, auditoria. Se você precisa das duas coisas, mantenha o stream como fonte e derive a tabela; o contrário perde história.

`GlobalKTable` só vale para dados pequenos e relativamente estáveis: tabela de países, plano de assinatura, configuração. Acima de alguns gigabytes por instância, a restauração e o heap viram o gargalo. Para referência grande, prefira um join stream-tabela co-particionado ou uma consulta externa com cache.

## Armadilhas comuns

- **Guardar histórico num KTable.** O valor antigo é sobrescrito e a auditoria desaparece.
- **`groupBy` sem necessidade.** Cada troca de chave cria um tópico de repartição e dobra o tráfego.
- **Mudar partições depois do join.** O requisito de co-particionamento quebra e a topologia falha.
- **Usar `GlobalKTable` como cache de tudo.** A réplica completa custa memória em cada instância.
- **Testar só com `TopologyTestDriver`.** Ele não valida partições, rebalance nem restauração.

## Checklist de domínio

- [ ] Você escolhe KStream ou KTable pela pergunta de negócio, não pelo tipo do tópico
- [ ] Você identifica no `describe()` onde há repartição e state store
- [ ] Você explica por que um join exige a mesma chave e o mesmo número de partições
- [ ] Você sabe quando um `GlobalKTable` compensa

## Para ir além

- [Apache Kafka — Streams DSL](https://kafka.apache.org/documentation/streams/developer-guide/dsl-api.html)
- [Apache Kafka — Streams Architecture](https://kafka.apache.org/documentation/streams/architecture)
- [Confluent — KStream, KTable and GlobalKTable](https://docs.confluent.io/platform/current/streams/concepts.html)
