Comparações ficam abaixo dos aritméticos: `1 + 2 < 4` → `(< (+ 1.0 2.0) 4.0)`.

## O que você vai aprender

- mais um nível da gramática.

## O que fazer

`comparison → term ( ( ">" | ">=" | "<" | "<=" ) term )*`.

## Como o tester valida

- comparações entre expressões aritméticas, inclusive encadeadas (`a < b < c`).

## Critério de conclusão

Comparações são parseadas.
