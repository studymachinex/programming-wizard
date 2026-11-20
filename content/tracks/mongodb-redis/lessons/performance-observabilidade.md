> **Em uma frase:** latência de Redis é previsível até aparecer uma big key, um comando O(n) ou uma política de memória que começa a evictar o que você precisa.

Redis é single-threaded para comandos. Tudo que bloqueia o event loop aparece como pico de latência para todos os clientes. Diagnosticar exige olhar memória, comandos lentos, rede e padrão de acesso.

## O problema

O p99 sobe de 2 ms para 200 ms sem aumento de tráfego. O log não mostra erro. O `INFO` revela `evicted_keys` crescendo e `used_memory` no limite. Ou existe uma chave com 5 milhões de elementos e um `DEL` síncrono travando tudo. Ou o cliente faz 500 round-trips por request.

## Como funciona

**Pipelining:** envie vários comandos sem esperar resposta. Reduz RTT, não paraleliza no servidor.

```java
try (var connection = redis.connect()) {
    var pipeline = connection.pipelined();
    for (var id : ids) pipeline.get("produto:" + id);
    var respostas = pipeline.syncAndReturnAll();
}
```

**Big keys:** `MEMORY USAGE chave` e `--bigkeys` no redis-cli. Divida estruturas; use `UNLINK` para deletar em background.

**Hot keys:** uma chave recebe a maior parte do tráfego. Replique a chave com sufixo aleatório e agregue na leitura, ou use cache local.

**Memória:** `maxmemory` + `maxmemory-policy`. Para cache puro, `allkeys-lru` ou `allkeys-lfu`; para dados mistos, `volatile-lru` com TTL. `noeviction` rejeita escritas quando cheio.

| Sintoma | Causa provável | Ação |
|---|---|---|
| p99 alto, CPU 100% | Comando O(n) | `SLOWLOG`, dividir chave |
| Evictions | Memória insuficiente | Ajustar policy/TTL |
| Fragmentação | Muitas deleções | `activedefrag` |
| Latência de rede | Muitos RTTs | Pipeline |

## Na prática

Monitore `latency`, `slowlog`, `memory`, `evicted_keys`, `connected_clients` e `keyspace_hits/misses`. Use `SCAN` em vez de `KEYS`. Para relatórios, prefira estruturas pré-agregadas.

Em Java, configure pool, timeout e reconnect. Um pool grande demais aumenta contenção; pequeno demais enfileira. Meça com carga realista.

## Armadilhas comuns

- `KEYS *` ou `HGETALL` de hash gigante.
- `DEL` síncrono de big key.
- `maxmemory` sem policy definida.
- Pipeline gigante estourando memória do cliente.
- Achar que Redis Cluster resolve hot key.

## Checklist de domínio

- [ ] Leio `SLOWLOG`, `INFO` e `MEMORY`.
- [ ] Identifico big keys e hot keys.
- [ ] Escolho política de eviction.
- [ ] Uso pipeline com limite.
- [ ] Meço latência do cliente, não só do servidor.

## Para ir além

Leia o guia de latency troubleshooting do Redis e a documentação de eviction. Depois crie uma big key e observe o impacto no p99.
