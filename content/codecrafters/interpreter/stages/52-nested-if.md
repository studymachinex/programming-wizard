Em `if (a) if (b) x; else y;`, a quem pertence o `else`? Ao `if` **mais próximo** (é o que o
parser descendente faz naturalmente).

## O que você vai aprender

- o problema do *dangling else*.

## O que fazer

Garanta que o `else` é consumido pelo `if` interno.

## Como o tester valida

- os dois casos clássicos de `else` pendente e `if` aninhados com blocos.

## Critério de conclusão

`if` aninhados funcionam.
