Índices negativos também valem no `ZRANGE`.

## O que você vai aprender

- consistência entre comandos.

## O que fazer

Normalize como no `LRANGE`.

## Como o tester valida

- `-2 -1`, `0 -1`, `-10 1`.

## Critério de conclusão

`ZRANGE` aceita índices negativos.
