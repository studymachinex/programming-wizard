Localizações são guardadas num **sorted set**: `TYPE` é `zset` e `ZCARD` conta os lugares. Adicionar
um lugar existente não conta como novo.

## O que você vai aprender

- reaproveitar estruturas.

## O que fazer

Guarde cada lugar como membro de um sorted set.

## Como o tester valida

- vários lugares, `TYPE`, `ZCARD` e re-adição.

## Critério de conclusão

Lugares são guardados.
