`{n,}` repete **pelo menos n vezes**, sem limite.

## O que você vai aprender

- que `+` é `{1,}` e `*` é `{0,}`.

## O que fazer

Faça o parse de `{n,}` com `max` infinito.

## Como o tester valida

- `^ca{N,}t$` com mais e com menos `a`s;
- `-o -E '\d{2,}'` contra `1 22 333 4` → `22` e `333`.

## Critério de conclusão

`{n,}` funciona.
