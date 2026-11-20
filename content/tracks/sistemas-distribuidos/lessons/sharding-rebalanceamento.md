> **Em uma frase:** sharding não é "dividir a tabela" — é escolher uma chave que distribua carga e consultas, sabendo que toda escolha cria um padrão de acesso ruim.

Quando uma tabela passa de bilhões de linhas ou de um único servidor, você particiona os dados entre shards. A chave decide tudo: distribuição, hotspots, custo de rebalanceamento e quais queries precisam consultar todos os shards.

## O problema

Um feed de pedidos é shardado por `created_at`. Todas as escritas novas caem no shard mais recente: hotspot. Outro sistema sharda por `user_id`, mas o relatório administrativo precisa varrer todos os shards. A chave resolveu um problema e criou dois.

## Como funciona

Estratégias:

- **Range:** `user_id` 0-1M no shard A. Bom para range queries, ruim para monotonicidade.
- **Hash:** `hash(user_id) % N`. Distribui bem, mas range query vira fan-out.
- **Directory:** tabela de lookup. Flexível, mas vira ponto de falha e latência.
- **Consistent hashing:** minimiza movimento ao adicionar nós; usado por Cassandra e DynamoDB.

```java
int shardOf(long userId, int shards) {
    return Math.floorMod(Long.hashCode(userId), shards);
}

// consulta por chave: um shard
var pedidos = shard(shardOf(userId)).buscarPorUsuario(userId);

// consulta global: fan-out e merge
var todos = shards.parallelStream()
    .flatMap(s -> s.buscarPorStatus("PAGO").stream())
    .sorted(byCreatedAt)
    .limit(50)
    .toList();
```

## Na prática

Escolha a shard key pela consulta mais frequente e pela distribuição de escrita. Alta cardinalidade ajuda; baixa cardinalidade cria shards desiguais. Evite chaves monotônicas (timestamp, auto-increment) para escrita.

Rebalanceamento: mova dados em background, com dual-write ou cópia + troca de rota. Consistent hashing move apenas a vizinhança. Sempre tenha um plano para shard quente: split, chave composta ou cache.

Consultas cross-shard são caras: agregue em paralelo, limite o fan-out e cacheie resultados. Se a maioria das queries precisa de todos os shards, talvez o sharding não seja a resposta.

## Armadilhas comuns

- Shard por `created_at` e criar hotspot de escrita.
- Esquecer índices globais/secundários.
- Rebalancear sem medir e derrubar latência.
- Query sem shard key varrendo tudo silenciosamente.
- Shards desiguais por celebridade (hot partition).

## Checklist de domínio

- [ ] Comparo range, hash e directory.
- [ ] Escolho chave por acesso e distribuição.
- [ ] Sei o custo de query cross-shard.
- [ ] Tenho plano de rebalanceamento.
- [ ] Detecto hot partitions.

## Para ir além

Leia o capítulo de sharding do System Design Primer e a documentação de consistent hashing. Depois simule 10 milhões de chaves e desenhe a distribuição.
