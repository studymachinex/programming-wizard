> **Em uma frase:** réplica set dá disponibilidade e leitura escalável; sharding dá escala horizontal — mas uma shard key ruim transforma escala em hotspot.

MongoDB replica por padrão com um primary e secundários. Sharding divide os dados por faixa/hash e adiciona roteadores. Entender read/write concern é o que separa "funciona" de "funciona com a consistência que o negócio exige".

## O problema

Uma leitura de relatório no primary compete com escritas. Um failover derruba a aplicação porque o driver não reconecta. Um cluster shardado por `createdAt` concentra todas as inserções na última shard. Cada decisão tem custo.

## Como funciona

**Replica set:** primary aceita escritas; secundários replicam o oplog. Eleição por maioria. `writeConcern` define quantos nós confirmam: `1`, `majority` ou tag set. `readPreference` define de onde ler: `primary`, `primaryPreferred`, `secondary`, `nearest`. `readConcern` define o isolamento da leitura (`local`, `majority`, `snapshot`).

```java
var settings = MongoClientSettings.builder()
    .applyConnectionString(new ConnectionString(uri))
    .readPreference(ReadPreference.secondaryPreferred())
    .writeConcern(WriteConcern.MAJORITY)
    .build();

try (var client = MongoClients.create(settings)) {
    var pedidos = client.getDatabase("loja").getCollection("pedidos");
    pedidos.insertOne(new Document("_id", id).append("total", total));
}
```

**Sharding:** shard key determina distribuição. Range favorece consultas por faixa; hash distribui escritas; composta equilibra. O mongos roteia; consultas sem shard key fazem scatter-gather.

## Na prática

Use `majority` para dados críticos e `secondaryPreferred` para relatórios tolerantes a lag. Cuidado com "read your own writes": leia do primary após escrever. Monitore replication lag e failover.

Shard key: alta cardinalidade, baixa monotonicidade, presente nas queries. Para pedidos, `{tenantId: "hashed"}` ou `{tenantId: 1, pedidoId: 1}`. Evite `ObjectId` puro como chave de escrita se todas as inserções são recentes.

## Armadilhas comuns

- Ler de secundário e mostrar dado que o usuário acabou de gravar.
- `writeConcern: 1` achando que é durável.
- Shard key monotônica.
- Query de relatório sem shard key varrendo o cluster.
- Failover não testado no driver.

## Checklist de domínio

- [ ] Explico primary/secundário e eleição.
- [ ] Escolho write/read concern por requisito.
- [ ] Sei o custo de scatter-gather.
- [ ] Avalio cardinalidade da shard key.
- [ ] Testei failover com o driver Java.

## Para ir além

Leia os capítulos de replication e sharding do MongoDB. Depois suba um replica set local e derrube o primary durante uma escrita.
