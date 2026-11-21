**Bitmaps** não são um tipo novo: são strings manipuladas bit a bit. `SETBIT chave offset 0|1` muda
um bit e devolve o valor **anterior** dele.

## O que você vai aprender

- operações em nível de bit.

## O que fazer

Crie a string se não existir (com zeros) e altere o bit.

## Como o tester valida

- `SETBIT k 7 1` → `:0`; de novo → `:1`; `SETBIT k 7 0` → `:1`; `TYPE` → `string`.

## Dicas

- Numeração de bits: o bit 0 é o bit **mais significativo** do primeiro byte (`0x80`).

## Critério de conclusão

`SETBIT` funciona.
