**Streams** são logs só de acréscimo: cada entrada tem um **ID** `<milissegundos>-<sequência>` e
pares campo/valor. `XADD stream 1-1 temperatura 21` acrescenta a entrada e devolve o ID (bulk string).

## O que você vai aprender

- o modelo de dados de streams (usado para eventos e filas).

## O que fazer

Guarde as entradas em ordem, com o ID e os campos. `TYPE` de um stream é `stream`.

## Como o tester valida

- dois `XADD` e `TYPE`.

## Critério de conclusão

`XADD` cria streams.
