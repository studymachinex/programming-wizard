`{n,m}` repete **entre n e m vezes** (inclusive).

## O que você vai aprender

- que o guloso para no máximo: `x{1,3}` em `xxxxx` casa `xxx`, depois `xx`.

## O que fazer

Faça o parse de `{n,m}`.

## Como o tester valida

- `^ca{2,4}t$` com 1, 3 e 5 `a`s;
- `-o -E 'x{1,3}'` contra `xxxxx` → `xxx` e `xx`.

## Critério de conclusão

`{n,m}` funciona.
