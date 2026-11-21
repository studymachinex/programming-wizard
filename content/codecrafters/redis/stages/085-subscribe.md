**Pub/Sub**: clientes assinam canais e recebem o que for publicado neles. `SUBSCRIBE canal`
responde `["subscribe", canal, <quantos canais este cliente assina>]`.

## O que você vai aprender

- mensageria publish/subscribe.

## O que fazer

Guarde as assinaturas da conexão e responda o array.

## Como o tester valida

- `SUBSCRIBE <canal>` → `[subscribe, canal, 1]`.

## Critério de conclusão

`SUBSCRIBE` funciona.
