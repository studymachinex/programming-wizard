`DISCARD` descarta a fila e encerra a transação (`+OK`). Sem transação: `-ERR DISCARD without MULTI`.

## O que você vai aprender

- cancelamento.

## O que fazer

Limpe a fila e saia do modo transação.

## Como o tester valida

- `MULTI`, `SET`, `DISCARD` → o valor não foi gravado; `DISCARD` e `EXEC` depois → erros.

## Critério de conclusão

`DISCARD` funciona.
