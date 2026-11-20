> **Em uma frase:** RDB e AOF respondem a perguntas diferentes: quanto você aceita perder e quanto tempo aceita esperar para voltar.

Redis é em memória, mas pode persistir. RDB tira snapshots compactos; AOF registra cada escrita. A escolha define RPO (dados perdidos no crash) e RTO (tempo de restart), além do custo de disco e CPU.

## O problema

Um cache pode perder tudo sem drama; uma fila de jobs não. Se o Redis reinicia e perde 5 minutos de eventos, você precisa saber se o consumidor reprocessa ou se o dado sumiu. Sentinel dá failover, mas não garante zero perda sem réplica síncrona.

## Como funciona

**RDB:** `save`/`bgsave` gera um dump binário. Restart rápido e arquivo pequeno; perde desde o último snapshot.

**AOF:** append de comandos. `appendfsync always` perde quase nada, mas custa latência; `everysec` perde até 1 s; `no` deixa o SO decidir. AOF pode ser reescrito para compactar.

```
appendonly yes
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

**Sentinel:** monitora, elege e promove réplica. O cliente precisa de um Sentinel-aware driver.

**Cluster:** sharding por hash slot (16384 slots). Operações multi-key exigem o mesmo slot; use hash tags.

```java
var config = new RedisClusterClientConfiguration();
config.setMaxRedirects(5);
var client = RedisClusterClient.create(
    RedisURI.create("redis://localhost:7000"), config);
```

## Na prática

Defina RPO/RTO por caso:

| Caso | Persistência | Failover |
|---|---|---|
| Cache | Nenhuma ou RDB | Sentinel/Cluster |
| Sessão | AOF everysec | Sentinel |
| Fila crítica | AOF always + réplica | Cluster/Sentinel + idempotência |

Teste com `kill -9` no container e meça quantos dados sobrevivem. Backup de RDB/AOF precisa ser copiado para fora do host.

## Armadilhas comuns

- Achar que Sentinel garante zero perda (replicação é assíncrona).
- AOF `always` sem medir latência.
- Cluster com operações multi-key em slots diferentes.
- Não testar restauração.
- Guardar dados críticos só em Redis sem fonte da verdade.

## Checklist de domínio

- [ ] Explico RDB vs AOF e RPO/RTO.
- [ ] Configuro appendfsync por requisito.
- [ ] Sei como Sentinel promove réplica.
- [ ] Entendo hash slots e hash tags.
- [ ] Testei crash e restauração.

## Para ir além

Leia o capítulo de persistence do Redis e o tutorial de Cluster. Depois simule um crash com AOF everysec e conte as perdas.
