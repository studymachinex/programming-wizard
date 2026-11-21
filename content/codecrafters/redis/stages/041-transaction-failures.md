Se um comando falha **durante** o `EXEC`, os outros continuam: o erro aparece na posição dele no
array de respostas (não há rollback).

## O que você vai aprender

- a semântica de transações do Redis (atomicidade sem rollback).

## O que fazer

Capture o erro de cada comando e coloque-o no array.

## Como o tester valida

- `INCR` de texto e `INCR` de número na mesma transação → `[-ERR ..., :8]`.

## Critério de conclusão

Falhas não interrompem a transação.
