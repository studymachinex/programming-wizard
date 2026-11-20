> **Em uma frase:** pagamento é o domínio onde idempotência não é opcional — cada retry pode virar dinheiro cobrado duas vezes.

Um sistema de pagamentos integra adquirentes, antifraude, ledger e notificações. A arquitetura precisa garantir exactly-once no efeito financeiro, mesmo com falhas parciais. Chave de idempotência, máquina de estados e ledger imutável são a base.

## Requisitos

- 10k pagamentos/s no pico.
- Nenhuma cobrança duplicada.
- Consistência forte no status do pagamento.
- Suporte a cartão, Pix e boleto.
- Auditoria completa e conciliação.

## Capacity estimation

10k/s × 500 B = 5 MB/s. Ledger cresce 10k × 86.400 = 864M registros/dia; particionar por data e arquivar. Latência alvo: autorização < 2 s p99.

## API

```text
POST /pagamentos
Idempotency-Key: uuid
{pedidoId, valor, moeda, metodo, clienteId}

GET /pagamentos/{id}
POST /webhooks/adquirente
```

## Arquitetura

```text
Cliente --> API --> idempotência (Redis + unique no BD)
                --> antifraude
                --> adquirente (timeout curto)
                --> ledger (append-only)
                --> outbox --> eventos
                --> conciliação
```

## Decisões e trade-offs

- **Idempotência:** chave única por cliente + hash do payload; mesma chave com payload diferente = 409.
- **Estado:** `CRIADO -> AUTORIZANDO -> APROVADO/RECUSADO -> CAPTURADO -> LIQUIDADO`; transições válidas no domínio.
- **Ledger:** partidas dobradas, imutável; correções via estorno, nunca update.
- **Timeout:** nunca assumir falha do adquirente; consultar status antes de retry cego.
- **Webhook:** verificar assinatura, deduplicar por eventId, responder 2xx rápido e processar async.
- **Consistência:** forte no pagamento; eventual em notificações e relatórios.

## Gargalos

Adquirente (latência e indisponibilidade), picos de checkout, conciliação e fraude. Use circuit breaker, filas e fallback de adquirente.

## Checklist de resposta

- [ ] Requisitos e números.
- [ ] Idempotência ponta a ponta.
- [ ] Máquina de estados e ledger.
- [ ] Timeout/retry e webhook.
- [ ] Conciliação e auditoria.

## Para ir além

Leia o artigo de idempotência da AWS e o design de pagamentos do System Design Primer. Depois simule timeout do adquirente e prove que não há cobrança dupla.
