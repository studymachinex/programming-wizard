> **Em uma frase:** busca web é índice invertido distribuído + ranking + cache — rastrear é caro, servir é latência.

O design de Google Search em entrevista foca no serving: consulta -> análise -> posting lists -> ranking -> resultados. O crawl e a indexação são pipelines offline; o índice é shardado e replicado.

## Requisitos

- 10B documentos, 100k consultas/s.
- Resposta < 200 ms p99.
- Ranking por relevância e qualidade.
- Tolerância a falha e atualização contínua.
- Filtros e paginação.

## Capacity estimation

Índice invertido: ~100 GB por bilhão de documentos comprimido (ordem de grandeza). 10B -> ~1 TB, replicado 3x. Consulta média 3 termos; posting lists podem ter milhões de entradas — use skip pointers e compressão.

## API

```text
GET /busca?q=...&pagina=...
GET /sugestoes?q=...
```

## Arquitetura

```text
Crawler --> parser --> indexer --> índice invertido (shards)
                              --> link graph / ranking signals
Consulta --> analyzer --> shard routers --> posting lists --> ranking --> cache
                                                   --> sugestões (trie)
```

## Decisões e trade-offs

- **Índice invertido shardado por termo/documento:** consulta faz fan-out para shards; merge dos top-k.
- **Ranking:** BM25 + sinais (links, cliques, qualidade); duas fases: retrieve e rerank.
- **Cache:** consultas populares e resultados; invalidação por TTL.
- **Atualização:** índice near-real-time para notícias; batch para o resto.
- **Consistência:** eventual; documento novo pode demorar.
- **Sugestões:** trie/FSM em memória, atualizada periodicamente.

## Gargalos

Fan-out de posting lists, cauda longa, ranking e atualização. Mitigações: shards por hash de termo, top-k cedo, cache e poda.

## Checklist de resposta

- [ ] Requisitos e números.
- [ ] Índice invertido e sharding.
- [ ] Ranking em duas fases.
- [ ] Cache e atualização.
- [ ] Fan-out e latência.

## Para ir além

Leia o design de search do System Design Primer e o artigo do Google sobre índice. Depois implemente um índice invertido para 1M documentos.
