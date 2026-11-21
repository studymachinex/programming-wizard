`SETBIT` num offset além do tamanho estende a string com bytes zero.

## O que você vai aprender

- crescimento de buffers.

## O que fazer

Complete com `\0` até o byte necessário.

## Como o tester valida

- `SETBIT k 3 1` e `SETBIT k <60..120> 1`; o valor tem o tamanho e os bytes exatos.

## Critério de conclusão

Bitmaps crescem.
