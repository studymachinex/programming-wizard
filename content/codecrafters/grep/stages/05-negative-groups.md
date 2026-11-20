`[^abc]` casa com qualquer caractere **que não esteja** na lista.

## O que você vai aprender

- negação de classes.

## O que fazer

Se o grupo começa com `^`, inverta o resultado do predicado.

## Como o tester valida

- `[^xyz]` contra `apple` casa; `[^abc]` contra `cab` não (todos os caracteres estão no grupo).

## Dicas

- O `^` só nega quando é o **primeiro** caractere depois de `[`.

## Critério de conclusão

`[^abc]` casa com caracteres fora da lista.
