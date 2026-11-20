> **Em uma frase:** fila não elimina trabalho, ela muda quando e onde o trabalho acontece — e cobra esse adiamento com duplicatas, ordering e operação.

## O problema

No checkout, a API cria o pedido, reserva estoque, debita o cartão, envia e-mail e atualiza o programa de fidelidade. Tudo síncrono. O provedor de e-mail tem p99 de 2 segundos; quando ele degrada, o checkout inteiro degrada. Um cliente clica em "comprar" duas vezes porque o botão não responde, e você cria dois pedidos. A fila parece a solução óbvia: publique um evento e responda rápido.

Você adiciona Kafka. Agora o e-mail é assíncrono, o checkout responde em 150 ms, mas aparecem pedidos duplicados, eventos fora de ordem e um consumidor travado que ninguém percebeu. A fila não criou esses problemas; ela revelou que o sistema não era idempotente e que ninguém media lag. Em entrevista, dizer "uso fila para desacoplar" sem tratar desses pontos é resposta de tutorial, não de engenheiro.

O objetivo é escolher entre **fila de trabalho** e **log de eventos**, definir a garantia de entrega e projetar o consumidor para sobreviver a reentrega. Sem isso, você só empurrou a falha para outro processo.

## Como funciona

### Fila versus log

| Aspecto | Fila (SQS, RabbitMQ) | Log (Kafka, Kinesis) |
|---|---|---|
| Consumo | Mensagem removida após ack | Mensagem retida; offset por consumidor |
| Replay | Limitado ou inexistente | Sim, dentro da retenção |
| Ordering | Por fila, com concorrência limitada | Por partição |
| Throughput | Alto, mas limitado por ack | Muito alto, sequencial por partição |
| Uso típico | Tarefas, comandos, desacoplamento | Eventos, streaming, múltiplos consumidores |

Em uma fila de trabalho, você quer que cada mensagem seja processada uma vez por um worker. Em um log, você quer que vários consumidores leiam o mesmo fluxo de forma independente: o serviço de fraude, o de e-mail e o data lake podem consumir o mesmo `order.created` sem competir. Se o requisito é replay ou fanout de eventos, log. Se é distribuir tarefas com ack e visibilidade, fila.

### Garantias de entrega

**At-most-once** pode perder mensagens; raramente aceitável. **At-least-once** é o padrão: o consumidor processa e depois comita o offset; se cair antes do commit, a mensagem volta. **Exactly-once** de ponta a ponta é ilusório quando há efeitos externos (e-mail, cobrança, HTTP). Kafka oferece transações que dão exactly-once dentro do ecossistema Kafka, mas o e-mail enviado ou o cartão cobrado continuam exigindo idempotência.

A solução é separar **entrega** de **efeito**. A mensagem pode chegar duas vezes; o efeito tem de ser aplicado uma vez. Para isso, use uma chave de idempotência (o `event_id` ou `order_id`) e registre o processamento na mesma transação do efeito. Um `SET` em Redis com TTL maior que a retenção também funciona, desde que você aceite a janela e o custo.

### Ordering e partições

Kafka garante ordem dentro de uma partição. Se você precisa que todos os eventos de um pedido cheguem na ordem, use `order_id` como partition key: o mesmo pedido sempre cai na mesma partição. Isso limita o paralelismo por pedido, mas não entre pedidos. Ordem global é cara e raramente necessária; se o produto exige, você criou um gargalo de throughput por design.

Partições também definem o paralelismo do consumidor: um grupo com 12 consumidores e 6 partições deixa 6 consumidores ociosos. Dimensione partições pelo pico de paralelismo, não pelo volume médio. Cada partição sustenta alguns MB/s; um cluster Kafka bem dimensionado passa de centenas de milhares de mensagens/s, mas o número relevante é o seu.

### Backpressure, retry e DLQ

Quando a produção supera o consumo, o lag cresce. Se crescer para sempre, você perde o SLA. Monitore lag por partição, alerte antes de a retenção estourar e escale consumidores. Se não houver capacidade, aplique backpressure na entrada: limite de fila, 429, load shedding. Retry infinito transforma um erro em tempestade.

Retries precisam de backoff exponencial com jitter. Sem jitter, todos os clientes tentam no mesmo instante. Depois de N tentativas, mande para uma dead-letter queue (DLQ) com contexto e alarme. DLQ sem alerta é um cemitério silencioso; você descobre o problema quando o cliente reclama.

```java
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class IdempotentConsumer {

    public interface ProcessedStore {
        boolean markIfAbsent(String messageId);
    }

    private final ProcessedStore store;

    public IdempotentConsumer(ProcessedStore store) {
        this.store = store;
    }

    public boolean handle(String messageId, Runnable effect) {
        // Em produção, markIfAbsent e effect devem participar da mesma transação
        // (tabela processed + alteração de negócio) para não perder nem duplicar.
        if (!store.markIfAbsent(messageId)) {
            return false;
        }
        effect.run();
        return true;
    }

    public static void main(String[] args) {
        Set<String> processed = ConcurrentHashMap.newKeySet();
        var consumer = new IdempotentConsumer(processed::add);
        Runnable charge = () -> System.out.println("cobrança aplicada");

        System.out.println(consumer.handle("evt-1", charge));
        System.out.println(consumer.handle("evt-1", charge));
    }
}
```

```java
import java.util.concurrent.ThreadLocalRandom;

public class RetryPolicy {

    public record Delay(long millis, int attempt) {}

    private final int maxAttempts;
    private final long baseMillis;
    private final long maxMillis;

    public RetryPolicy(int maxAttempts, long baseMillis, long maxMillis) {
        this.maxAttempts = maxAttempts;
        this.baseMillis = baseMillis;
        this.maxMillis = maxMillis;
    }

    public Delay next(int attempt) {
        if (attempt >= maxAttempts) {
            throw new IllegalStateException("exauriu tentativas: enviar para DLQ");
        }
        long exponential = baseMillis * (1L << attempt);
        long capped = Math.min(exponential, maxMillis);
        long jittered = ThreadLocalRandom.current().nextLong(capped / 2, capped + 1);
        return new Delay(jittered, attempt + 1);
    }

    public static void main(String[] args) {
        var policy = new RetryPolicy(5, 200, 30_000);
        for (int i = 0; i < 4; i++) {
            var d = policy.next(i);
            System.out.printf("tentativa %d em %d ms%n", d.attempt(), d.millis());
        }
    }
}
```

## Na prática

No checkout, o fluxo correto é: a API grava `order` e `outbox` na mesma transação local. Um relay lê a outbox e publica `order.created` no Kafka com `order_id` como chave. E-mail, estoque, fraude e ledger consomem em grupos separados. Cada consumidor mantém uma tabela `processed(event_id)` e aplica o efeito na mesma transação. O estoque usa `order_id` para não reservar duas vezes; o ledger usa a mesma chave para não lançar duas partidas.

Por que outbox? Porque gravar no banco e publicar no Kafka são duas operações sem transação comum. Se o publish falhar depois do commit, o pedido existe e o evento some. Se publicar antes do commit, o evento existe e o pedido pode não existir. A outbox elimina o dual-write: o evento é parte da transação do pedido e o relay garante a publicação (com possível duplicata, resolvida pela idempotência).

```sql
-- Outbox transacional: o evento nasce junto com o pedido
BEGIN;
INSERT INTO orders (id, user_id, total_cents, status)
VALUES ('ord-123', 42, 19990, 'PENDING');

INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload)
VALUES ('evt-9', 'order', 'ord-123', 'order.created', '{"orderId":"ord-123"}');
COMMIT;
```

Com 1 milhão de pedidos/dia, são ~12/s na média e 100/s no pico. Kafka com 12 partições por `order_id` sobra. O storage com 10 KB por evento e retenção de 7 dias é ~70 GB, barato. O gargalo real não é o broker: é o consumidor de e-mail, que depende de um provedor externo com limite de 500/s. A fila absorve o pico; o consumidor precisa de rate limit e DLQ.

## Armadilhas comuns

- **Usar fila para esconder latência.** A resposta fica rápida, mas o trabalho continua. Se o usuário precisa do resultado, assíncrono não resolve.
- **Dual write.** Gravar no banco e publicar no broker sem outbox perde ou duplica eventos. Use a transação local.
- **Achar que Kafka dá exactly-once no mundo real.** O efeito externo continua não transacional; idempotência é sua responsabilidade.
- **Retry sem limite e sem jitter.** Cria tempestade e derruba o serviço que você tentava proteger.
- **Ignorar ordering por partição.** Trocar a partition key no meio do caminho reordena eventos e quebra a máquina de estados.
- **DLQ sem alarme.** Mensagens mortas acumulam e ninguém percebe até o incidente contábil.
- **Mensagens gigantes.** Kafka não é object storage; guarde o payload grande fora e passe a referência.

## Checklist de domínio

- [ ] Você escolhe fila ou log conforme consumo, replay e fanout
- [ ] Você explica at-least-once e projeta o consumidor idempotente
- [ ] Você define partition key e entende o limite de paralelismo
- [ ] Você usa outbox para eliminar dual-write
- [ ] Você opera lag, retry, DLQ e backpressure com métricas

## Para ir além

- [Kafka Documentation — Design](https://kafka.apache.org/documentation/#design) — log, partições, replicação e garantias na fonte.
- [Idempotent Consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html) — padrão e trade-offs.
- [Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html) — como publicar eventos sem dual-write.
- [Amazon SQS Developer Guide](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html) — visibilidade, DLQ e semântica de fila gerenciada.
