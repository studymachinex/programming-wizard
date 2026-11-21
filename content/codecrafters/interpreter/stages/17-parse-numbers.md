Números aparecem na árvore como double: `42` → `42.0`.

## O que você vai aprender

- a carregar valores dos tokens para a árvore.

## O que fazer

`NUMBER` vira `Literal(valor)`.

## Como o tester valida

- números inteiros e decimais, inclusive `42.000` → `42.0`.

## Dicas

- Formato do `parse`: notação prefixada entre parênteses — `(+ 1.0 2.0)`, `(group ...)`, `(- 5.0)`; literais como no `tokenize` (números com `.0`, strings sem aspas, `nil`, `true`, `false`).

## Critério de conclusão

Números são parseados.
