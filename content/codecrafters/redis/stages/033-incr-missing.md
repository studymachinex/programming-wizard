Chave inexistente vale 0: o primeiro `INCR` devolve 1.

## O que você vai aprender

- valores padrão.

## O que fazer

Trate a ausência como 0.

## Como o tester valida

- dois `INCR` numa chave nova → `:1`, `:2`.

## Critério de conclusão

`INCR` cria a chave.
