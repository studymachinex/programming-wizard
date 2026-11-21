`RPUSH chave a b c` acrescenta os três, em ordem.

## O que você vai aprender

- comandos com número variável de argumentos.

## O que fazer

Itere pelos argumentos a partir do segundo.

## Como o tester valida

- `RPUSH` com 3 e depois com 2 elementos → `:3` e `:5`.

## Critério de conclusão

`RPUSH` com vários elementos funciona.
