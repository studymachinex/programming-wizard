Multiplicação e divisão, associativas à esquerda: `1 * 2 / 3` → `(/ (* 1.0 2.0) 3.0)`.

## O que você vai aprender

- como precedência vira estrutura na gramática;
- associatividade à esquerda com um laço.

## O que fazer

`factor → unary ( ( "/" | "*" ) unary )*` — um `while` que vai embrulhando a expressão da
esquerda num `Binary`.

## Como o tester valida

- expressões aleatórias com `*`, `/`, unários e grupos.

## Dicas

- Formato do `parse`: notação prefixada entre parênteses — `(+ 1.0 2.0)`, `(group ...)`, `(- 5.0)`; literais como no `tokenize` (números com `.0`, strings sem aspas, `nil`, `true`, `false`).

## Critério de conclusão

`*` e `/` são parseados.
