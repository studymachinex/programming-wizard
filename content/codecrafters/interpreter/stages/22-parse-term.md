Soma e subtração têm precedência **menor** que `*` e `/`: `1 + 2 * 3` →
`(+ 1.0 (* 2.0 3.0))`.

## O que você vai aprender

- a empilhar níveis de precedência.

## O que fazer

`term → factor ( ( "-" | "+" ) factor )*`.

## Como o tester valida

- expressões aleatórias com os quatro operadores, unários e grupos.

## Dicas

- Formato do `parse`: notação prefixada entre parênteses — `(+ 1.0 2.0)`, `(group ...)`, `(- 5.0)`; literais como no `tokenize` (números com `.0`, strings sem aspas, `nil`, `true`, `false`).

## Critério de conclusão

Os quatro operadores aritméticos são parseados.
