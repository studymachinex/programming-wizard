Como bitmaps são strings, `GETBIT` funciona em qualquer string: `SET k Ok` e `GETBIT k 1` lê o
segundo bit de `O` (`0x4F`).

## O que você vai aprender

- a representação binária do texto.

## O que fazer

Garanta que strings guardadas por `SET` são lidas como bytes.

## Como o tester valida

- `SET` de uma palavra curta e `GETBIT` de todos os bits.

## Critério de conclusão

Strings podem ser lidas como bits.
