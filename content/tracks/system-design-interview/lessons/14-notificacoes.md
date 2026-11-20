> **Em uma frase:** notificações são um pipeline com fan-out, preferências, deduplicação e retry — o usuário só vê o canal, mas o sistema é fila e estado.

Um serviço de notificações envia push, e-mail, SMS e in-app. Precisa respeitar preferências, evitar spam, garantir entrega e lidar com provedores lentos. O design é menos sobre o canal e mais sobre orquestração e idempotência.

## Requisitos

- 100M usuários, 1B notificações/dia.
- Latência < 5 s para push; e-mail pode ser assíncrono.
- Preferências por canal e quiet hours.
- Deduplicação e rate limit por usuário.
- Retry com DLQ e observabilidade.

## Capacity estimation

1B/dia ≈ 12k/s média, 50k/s no pico. Cada evento ~1 KB = 50 MB/s no pico. Filas com retenção de 7 dias: ~350 TB se tudo persistido; retenção menor e compactação reduzem.

## API

```text
POST /notificacoes {userId, tipo, payload, idempotencyKey}
GET  /preferencias/{userId}
PUT  /preferencias/{userId}
```

## Arquitetura

```text
Produtores --> API --> valida preferências --> dedup (Redis) --> fila por canal
                                                         --> worker push/email/SMS
                                                         --> provedor --> status
                                                         --> DLQ
```

1. API valida payload e chave de idempotência.
2. Consulta preferências (cache + BD).
3. Deduplica por `(userId, tipo, janela)`.
4. Publica em fila por canal e prioridade.
5. Worker renderiza template e chama provedor com timeout.
6. Atualiza status; falha vai para retry/DLQ.

## Decisões e trade-offs

- **Fila por canal:** isola falha de provedor; prioridade para transacional.
- **Dedup:** Redis com TTL; chave de idempotência do produtor.
- **Rate limit:** token bucket por usuário/canal para evitar spam.
- **Templates:** versionados; fallback se variável faltar.
- **Entrega:** at-least-once + idempotência no provedor quando possível.
- **Preferências:** consistência eventual aceitável; cache curto.

## Gargalos

Provedor externo (limite e latência), fan-out para campanhas, renderização e picos. Campanhas devem ser agendadas e throttled, não disparadas de uma vez.

## Checklist de resposta

- [ ] Requisitos e números.
- [ ] Pipeline e filas por canal.
- [ ] Preferências e dedup.
- [ ] Retry/DLQ e status.
- [ ] Rate limit e prioridade.

## Para ir além

Leia o design de notificações do System Design Primer e as práticas de idempotência da AWS. Depois desenhe o fluxo de uma campanha para 10M usuários.
