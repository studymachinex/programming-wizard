E o contrário: ligando os bits certos, `GET` devolve texto. `SETBIT k 1 1` + `SETBIT k 7 1` → `GET k`
→ `A` (`0x41`).

## O que você vai aprender

- que string e bitmap são o mesmo dado.

## O que fazer

Garanta que o `GET` devolve os bytes do bitmap.

## Como o tester valida

- liga os bits de uma letra e lê com `GET`.

## Critério de conclusão

Bitmaps podem ser lidos como texto.
