> **Em uma frase:** escolher a estrutura Redis errada é como usar uma chave de fenda como martelo: funciona uma vez e destrói a escala depois.

Redis não é só `GET/SET`. Hashes, lists, sets, sorted sets, streams e HyperLogLog resolvem problemas diferentes com custos diferentes. A modelagem começa pela operação, não pelo tipo.

## O problema

Um ranking precisa de página por pontuação e posição de um usuário. Guardar em lista e ordenar na aplicação custa O(n log n) por request. Um contador de visitantes únicos com set cresce sem limite. Uma fila com `LPOP` perde mensagens quando o consumidor cai.

## Como funciona

| Estrutura | Use para | Complexidade típica |
|---|---|---|
| String | Cache, contador, lock | O(1) |
| Hash | Objeto com campos | O(1) por campo |
| List | Fila simples, histórico | O(1) nas pontas |
| Set | Membros únicos, interseção | O(1) add, O(n) op |
| Sorted set | Ranking, fila com score | O(log n) |
| Stream | Fila com consumer group/replay | O(1) add |
| HyperLogLog | Cardinalidade aproximada | O(1), ~12 KB |

```java
// ranking com sorted set
redis.zadd("ranking", 1500, "ana");
redis.zadd("ranking", 2200, "bruno");
var top10 = redis.zrevrangeWithScores("ranking", 0, 9);
var posicao = redis.zrevrank("ranking", "ana"); // 0-based

// fila confiável com stream
var msgId = redis.xadd("pedidos", StreamEntry.entry()
    .withField("id", "42").withField("tipo", "criado"));
redis.xgroupCreate("pedidos", "workers", "$");
var lidas = redis.xreadgroup(Consumer.from("workers", "w1"),
    XReadGroupArgs.Streams("pedidos", ">").count(10));
```

## Na prática

Modele por acesso: se você sempre lê o objeto inteiro, hash economiza memória; se precisa de campos independentes com TTL, strings separadas. Sorted sets para leaderboard, rate limit por janela e filas com prioridade.

Streams substituem listas quando você precisa de ACK, consumer group e replay. Pub/Sub é fire-and-forget; não use para trabalho.

Meça memória com `MEMORY USAGE` e evite big keys. Para cardinalidade aproximada, HyperLogLog troca exatidão por memória constante.

## Armadilhas comuns

- `KEYS *` em produção.
- List como fila sem confiabilidade.
- Set gigante para unicidade.
- Sorted set com milhões de membros e range amplo.
- Hash com milhares de campos e `HGETALL` frequente.

## Checklist de domínio

- [ ] Mapeio requisito para estrutura e complexidade.
- [ ] Sei quando usar stream em vez de list.
- [ ] Entendo custo de memória.
- [ ] Evito comandos O(n) em produção.
- [ ] Uso HyperLogLog quando aproximação basta.

## Para ir além

Leia a documentação de data types do Redis e o guia de streams. Depois implemente um ranking e uma fila confiável em Java.
