`history N` mostra apenas as N entradas mais recentes, mantendo a numeração original.

## O que você vai aprender

- a fatiar listas mantendo índices.

## O que fazer

Com argumento numérico, comece em `max(0, tamanho - N)`.

## Como o tester valida

- quatro comandos, `history 2` e `history 3`.

## Dicas

- Formato do `history`: número alinhado à direita em 5 colunas, dois espaços e o comando — `String.format("%5d  %s", n, comando)`.

## Critério de conclusão

`history N` funciona.
