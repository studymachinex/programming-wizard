Vários grupos, várias backreferences: `(\d+) (\w+) squares and \1 \2 circles`.

## O que você vai aprender

- a numerar grupos pela ordem do `(`.

## O que fazer

Guarde as capturas por número de grupo e resolva `\1` a `\9`.

## Como o tester valida

- `(\d+) (\w+) squares and \1 \2 circles` com números iguais e diferentes;
- `^(\w+) (\w+), \2 \1$`.

## Critério de conclusão

Várias backreferences funcionam.
