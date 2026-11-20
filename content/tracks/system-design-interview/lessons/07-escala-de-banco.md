> **Em uma frase:** réplica resolve leitura, sharding resolve escrita, e escolher o banco errado transforma os dois em dívida operacional.

## O problema

O primário do Postgres está em 100% de CPU. As leituras representam 90% do tráfego, então você adiciona duas réplicas. Funciona por três meses. Então as escritas crescem, o primário satura de novo, e alguém sugere sharding. Você sharda por `created_at`, e agora todo relatório precisa consultar 24 shards; o shard do mês corrente recebe todas as escritas e derrete. A equipe trocou um problema por três.

Escala de banco não é "adicionar máquinas". É escolher onde a consistência mora, qual consulta precisa ser local e qual preço você aceita pagar em complexidade. Réplica, partição, shard e índice são ferramentas diferentes; confundi-las é o erro mais caro dessa parte da entrevista.

O entrevistador quer ver você partir do access pattern. "Lê por id, escreve uma vez, atualiza raramente, consulta por merchant e por período" leva a uma resposta. "É um app social" não leva a nada.

## Como funciona

### Replicação

O primário aceita escritas e envia um log (WAL no Postgres, binlog no MySQL) para as réplicas. Na replicação **assíncrona**, o commit responde antes de a réplica confirmar. Latência baixa, risco de perder as últimas transações se o primário morrer. Na **síncrona**, o commit espera pelo menos uma réplica; você ganha durabilidade e paga latência. **Semi-síncrona** espera uma réplica específica ou um quórum, equilibrando os dois.

O lag típico assíncrono fica entre dezenas de milissegundos e alguns segundos sob carga. Isso quebra read-your-own-writes: o usuário salva o perfil, a leitura vai para a réplica atrasada e ele vê o valor antigo. Soluções: rotear as leituras do próprio usuário para o primário por uma janela, usar um token de versão (last-write timestamp) e esperar a réplica alcançar, ou ler do primário apenas logo após a escrita.

Failover não é gratuito. Promover uma réplica pode perder transações não replicadas e criar split-brain se o primário antigo voltar. Serviços gerenciados usam quórum e fencing; se você opera sozinho, precisa de consenso e de um plano para o cliente. Não diga "o banco faz failover" sem saber o RPO.

### Sharding

Sharding divide os dados em partições independentes, cada uma com seu primário. Escolha a chave pelo padrão de acesso:

| Estratégia | Vantagem | Risco |
|---|---|---|
| Range (`user_id` 0–1M) | Consultas por faixa eficientes | Hotspot no range mais recente |
| Hash (`hash(user_id) % N`) | Distribuição uniforme | Range scan vira scatter-gather |
| Directory | Flexível, permite mover | Serviço de lookup vira dependência |
| Geográfico | Latência e residência de dados | Regiões desbalanceadas |

A chave precisa ter alta cardinalidade e aparecer na maioria das consultas. Em um chat, `conversation_id` mantém mensagens da mesma conversa juntas e distribui conversas. Em um SaaS, `tenant_id` isola clientes e permite mover um tenant grande. Em um feed, `user_id` funciona para a timeline, mas consultas "posts de quem eu sigo" cruzam usuários e exigem fanout.

Sharding traz problemas que você precisa citar: transações cross-shard, joins, chaves únicas globais, rebalanceamento e consultas analíticas. Auto-incremento global não funciona; use Snowflake, UUIDv7 ou ranges alocados. Se você não consegue responder "como movo dados de um shard para outro sem downtime?", ainda não está pronto para shardar.

### SQL, NoSQL e NewSQL

| Família | Forte em | Fraco em | Exemplos |
|---|---|---|---|
| Relacional | Transações, joins, consistência, queries ad hoc | Escala de escrita vertical, sharding manual | Postgres, MySQL |
| Documento | Modelo agregado, flexibilidade de schema | Joins e transações multi-documento | MongoDB, DynamoDB |
| Wide-column | Escrita massiva, escala horizontal, TTL | Consultas flexíveis, consistência transacional | Cassandra, HBase |
| NewSQL | Transações distribuídas + escala horizontal | Custo, latência de consenso, maturidade | Spanner, CockroachDB, TiDB |

A pergunta não é "qual é mais moderno", é "meu access pattern cabe no modelo?". DynamoDB é excelente quando você conhece as queries e modela a partition key; é péssimo para relatórios ad hoc. Postgres aguenta muito mais do que a internet sugere: com bom índice, réplicas e PgBouncer, você chega a dezenas de milhares de leituras/s e milhares de escritas/s em um primário bem dimensionado.

```java
import java.util.List;

public class ShardRouter {

    public record Shard(String id, int start, int end) {}

    private final List<Shard> shards;

    public ShardRouter(List<Shard> shards) {
        this.shards = List.copyOf(shards);
    }

    public Shard byHash(long userId, int totalShards) {
        int bucket = Math.floorMod(Long.hashCode(userId), totalShards);
        return shards.get(bucket);
    }

    public Shard byRange(long userId) {
        return shards.stream()
            .filter(s -> userId >= s.start() && userId < s.end())
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("sem shard para " + userId));
    }

    public static void main(String[] args) {
        var shards = List.of(
            new Shard("shard-0", 0, 1_000_000),
            new Shard("shard-1", 1_000_000, 2_000_000),
            new Shard("shard-2", 2_000_000, 3_000_000)
        );
        var router = new ShardRouter(shards);
        System.out.println(router.byRange(1_500_000).id());
        System.out.println(router.byHash(42, 3).id());
    }
}
```

```java
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

public class ReadYourWritesRouter {

    public record Replica(String id, Duration lag, boolean healthy) {}

    private final Map<Long, Instant> lastWriteByUser;

    public ReadYourWritesRouter(Map<Long, Instant> lastWriteByUser) {
        this.lastWriteByUser = lastWriteByUser;
    }

    public String route(long userId, Replica replica) {
        Instant lastWrite = lastWriteByUser.get(userId);
        if (lastWrite != null && lastWrite.plus(replica.lag()).isAfter(Instant.now())) {
            return "primary";
        }
        return replica.healthy() ? replica.id() : "primary";
    }

    public static void main(String[] args) {
        var router = new ReadYourWritesRouter(Map.of(7L, Instant.now()));
        var replica = new Replica("replica-1", Duration.ofSeconds(2), true);
        System.out.println("usuário 7 -> " + router.route(7, replica));
        System.out.println("usuário 8 -> " + router.route(8, replica));
    }
}
```

## Na prática

Dois sistemas, duas respostas.

**Pagamentos.** Consistência forte, transações entre pedido, autorização e ledger, auditoria. Postgres com primário único, réplica síncrona em outra zona, sharding por `merchant_id` somente quando o volume exigir. Réplicas de leitura servem relatórios, nunca a decisão de saldo. O gargalo inicial é conexão e index, não shard.

**Feed.** Escrita massiva, leitura por usuário, tolerância a alguns segundos de atraso, TTL para posts velhos. Cassandra ou DynamoDB com partition key `user_id` e clustering key `post_id` descendente. Sem joins; o serviço hidrata autores e mídia. A consistência é eventual e o produto aceita.

Se você aplicar a arquitetura de pagamentos ao feed, paga latência e custo sem necessidade. Se aplicar a do feed a pagamentos, perde dinheiro. O access pattern é o juiz.

## Armadilhas comuns

- **Shardar antes de esgotar índice, cache e réplica.** Sharding é a alavanca mais cara; use quando a escrita não couber mais em um primário.
- **Chave de shard de baixa cardinalidade.** `status` ou `país` cria poucos shards e hotspots. Escolha algo distribuído e presente nas queries.
- **Esquecer chaves únicas globais.** E-mail único entre shards exige um índice separado ou um serviço de unicidade. Auto-incremento local gera colisão.
- **Ler do réplica logo após escrever.** O usuário vê o dado antigo e perde confiança. Use token de versão ou leia do primário.
- **Confundir partição de tabela com shard.** Partition pruning ajuda queries; não distribui carga entre máquinas.
- **Ignorar conexões.** 500 conexões por primário é comum; 5.000 derruba. PgBouncer ou proxy de conexão é parte da escala.

## Checklist de domínio

- [ ] Você explica replicação assíncrona, síncrona e o impacto no RPO
- [ ] Você escolhe uma chave de shard a partir do access pattern e justifica
- [ ] Você compara SQL, NoSQL e NewSQL por modelo, consistência e operação
- [ ] Você sabe mover um shard e manter chaves únicas globais
- [ ] Você reconhece quando o gargalo é conexão ou índice, não shard

## Para ir além

- [PostgreSQL High Availability, Load Balancing, and Replication](https://www.postgresql.org/docs/current/high-availability.html) — replicação e failover na fonte.
- [Vitess](https://vitess.io/) — sharding de MySQL em produção, com detalhes de resharding.
- [Apache Cassandra Documentation](https://cassandra.apache.org/doc/latest/) — modelo de dados, consistência e operação.
- [Jepsen Analyses](https://jepsen.io/analyses) — o que realmente acontece com consistência sob falha.
