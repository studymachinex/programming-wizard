O replay reconstrói tudo, inclusive listas e contadores, e o servidor continua gravando no
mesmo arquivo.

## O que você vai aprender

- a durabilidade fechando o ciclo.

## O que fazer

Garanta a ordem do replay e continue acrescentando ao arquivo.

## Como o tester valida

- `SET`, `RPUSH`, `INCR`, `LPUSH` no AOF; leituras e um `INCR` novo que deve ir para o fim do arquivo.

## Critério de conclusão

O AOF está completo.
