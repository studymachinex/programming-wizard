`XREAD STREAMS s1 s2 id1 id2` — primeiro todas as chaves, depois todos os IDs. A resposta tem um
item por stream com resultados.

## O que você vai aprender

- parsing de argumentos pareados.

## O que fazer

Divida os argumentos depois de `STREAMS` ao meio.

## Como o tester valida

- dois streams com IDs diferentes.

## Critério de conclusão

`XREAD` funciona com vários streams.
