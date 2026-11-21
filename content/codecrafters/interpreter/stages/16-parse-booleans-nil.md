Começa o **parser**: transformar tokens numa árvore sintática (AST). O comando
`./your_program.sh parse arquivo.lox` lê **uma expressão** e imprime a árvore.

Primeiro, os literais mais simples: `true`, `false` e `nil`.

## O que você vai aprender

- o que é uma AST;
- a estrutura de um parser descendente recursivo.

## O que fazer

1. Crie as classes da árvore (por exemplo, `Literal(Object value)`).
2. Escreva o parser com uma função por nível da gramática; por enquanto, `primary`.
3. Implemente um impressor da árvore.

## Como o tester valida

- `parse` de `true`, `false` e `nil`.

## Dicas

- Formato do `parse`: notação prefixada entre parênteses — `(+ 1.0 2.0)`, `(group ...)`, `(- 5.0)`; literais como no `tokenize` (números com `.0`, strings sem aspas, `nil`, `true`, `false`).

## Critério de conclusão

Literais booleanos e nil são parseados.
