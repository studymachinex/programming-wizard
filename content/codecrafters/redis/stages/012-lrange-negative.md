Índices negativos contam do fim: `-1` é o último, `-2` o penúltimo. Um início negativo maior que
a lista vira 0.

## O que você vai aprender

- normalização de índices.

## O que fazer

Antes de fatiar: índice negativo → `tamanho + índice` (início mínimo 0).

## Como o tester valida

- `-2 -1`, `0 -3`, `-10 1`, `0 -1`.

## Critério de conclusão

`LRANGE` aceita índices negativos.
