**Transações**: `MULTI` inicia; os comandos seguintes são enfileirados; `EXEC` executa todos de
uma vez, sem que outro cliente intercale comandos. Primeiro passo: `MULTI` responde `+OK`.

## O que você vai aprender

- estado por conexão.

## O que fazer

Responda `+OK` e marque a conexão como "em transação".

## Como o tester valida

- `MULTI` → `+OK`.

## Critério de conclusão

`MULTI` existe.
