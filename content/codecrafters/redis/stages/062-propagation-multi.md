Com várias réplicas, todas recebem todos os comandos de escrita.

## O que você vai aprender

- fan-out.

## O que fazer

Mantenha uma lista de réplicas conectadas.

## Como o tester valida

- três réplicas recebem `SET` e `INCR`.

## Critério de conclusão

Todas as réplicas recebem os comandos.
