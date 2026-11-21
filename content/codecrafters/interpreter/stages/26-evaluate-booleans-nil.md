Hora de **executar**. O comando `./your_program.sh evaluate arquivo.lox` parseia uma expressão,
calcula o valor e imprime.

## O que você vai aprender

- a percorrer a árvore calculando valores (*tree-walk interpreter*).

## O que fazer

Escreva `evaluate(Expr)`: um literal devolve o próprio valor. Imprima com uma função
`stringify` (`null` → `nil`).

## Como o tester valida

- `evaluate` de `true`, `false` e `nil`.

## Dicas

- Formato do `evaluate`: `nil`, `true`/`false`, strings sem aspas e números **sem** `.0` quando inteiros (`42`, mas `8.4`).

## Critério de conclusão

Literais são avaliados.
