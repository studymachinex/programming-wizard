`UNSUBSCRIBE canal` responde `["unsubscribe", canal, <canais restantes>]` e para de entregar
mensagens daquele canal.

## O que você vai aprender

- remoção de assinaturas.

## O que fazer

Remova a conexão do canal.

## Como o tester valida

- assina dois canais, cancela um; só o outro recebe; cancela o segundo → contagem 0.

## Critério de conclusão

Pub/Sub está completo.
