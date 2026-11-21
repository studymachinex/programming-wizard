Operadores unários: `!` (negação lógica) e `-` (negação numérica). Eles se aninham:
`!!true` → `(! (! true))`.

## O que você vai aprender

- a primeira regra recursiva de precedência: `unary → ("!" | "-") unary | primary`.

## O que fazer

Crie `Unary(operador, direita)` e a função `unary()`.

## Como o tester valida

- `!true`, `-42`, `!!(-7)` e combinações.

## Dicas

- Formato do `parse`: notação prefixada entre parênteses — `(+ 1.0 2.0)`, `(group ...)`, `(- 5.0)`; literais como no `tokenize` (números com `.0`, strings sem aspas, `nil`, `true`, `false`).

## Critério de conclusão

Operadores unários são parseados.
