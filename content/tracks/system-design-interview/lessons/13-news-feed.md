> **Em uma frase:** feed é uma decisão entre fan-out no write e fan-out no read — e celebridades quebram a simetria.

Um feed mostra posts de pessoas que você segue, ordenados por relevância/tempo. O desafio é entregar rápido para milhões de usuários, com custo de escrita e leitura equilibrado. A resposta madura é híbrida.

## Requisitos

- 500M usuários, 100M DAU.
- Post em < 2 s; feed em < 300 ms.
- Ordem cronológica ou ranking.
- Suporte a celebridades com 100M seguidores.
- Paginação estável.

## Capacity estimation

Se cada usuário segue 200 pessoas e posta 1x/dia, fan-out no write gera 100M × 200 = 20B entradas/dia. Inviável para todos. Fan-out no read: leitura consulta N seguidos e faz merge; caro para 200. Híbrido: fan-out no write para usuários normais, read para celebridades.

## API

```text
POST /posts            {texto, midia}
GET  /feed?cursor=...  -> itens ordenados
POST /follow/{id}
```

## Arquitetura

```text
Post --> Serviço de posts --> BD de posts
     --> Fan-out worker --> Feed cache (Redis) por usuário
     --> Celebridade: não fan-out; marcada como "pull"

Leitura --> Feed service --> feed cache + pull de celebridades --> merge/rank
```

## Decisões e trade-offs

- **Fan-out no write:** leitura O(1), escrita cara; bom para usuários normais.
- **Fan-out no read:** escrita barata, leitura faz merge; bom para celebridades e inativos.
- **Ranking:** compute no read com features; cache do resultado por alguns minutos.
- **Paginação:** cursor por `(score, postId)`, não offset.
- **Armazenamento:** posts em BD shardado por autor; feed em Redis com TTL.
- **Consistência:** eventual; um post pode demorar segundos para aparecer.

## Gargalos

Fan-out para celebridades, cache frio, ranking caro e picos de tráfego. Mitigações: limite de fan-out, filas, cache em camadas e pré-computação.

## Checklist de resposta

- [ ] Requisitos e números.
- [ ] Fan-out write vs read.
- [ ] Modelo de dados e paginação.
- [ ] Ranking e cache.
- [ ] Celebridades e consistência.

## Para ir além

Leia o design de news feed do System Design Primer e o artigo de feed do Instagram. Depois calcule o custo de fan-out para um usuário com 1.000 seguidores.
