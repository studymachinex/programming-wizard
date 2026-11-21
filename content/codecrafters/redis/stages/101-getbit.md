`GETBIT chave offset` devolve o bit (0 fora do tamanho ou para chave inexistente).

## O que você vai aprender

- deslocamentos e máscaras.

## O que fazer

Byte = offset / 8; bit = 7 − offset % 8.

## Como o tester valida

- liga alguns bits e lê os 24 primeiros, um além do tamanho e uma chave inexistente.

## Dicas

- Numeração de bits: o bit 0 é o bit **mais significativo** do primeiro byte (`0x80`).

## Critério de conclusão

`GETBIT` funciona.
