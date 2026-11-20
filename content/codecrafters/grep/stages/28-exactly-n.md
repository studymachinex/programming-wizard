`{n}` repete o item **exatamente n vezes**: `a{3}` é `aaa`.

## O que você vai aprender

- a generalizar quantificadores como `{min,max}`.

## O que fazer

Faça o parse de `{n}` depois de um item e repita exatamente `n` vezes.

## Como o tester valida

- `^ca{N}t$` com N e N+1 `a`s; `\d{3}-\d{4}`.

## Dicas

- Se o seu `Repeat` tem `min` e `max`, `{n}` é `min = max = n`.

## Critério de conclusão

`{n}` funciona.
