`or` devolve o **primeiro operando verdadeiro** (ou o último) — não necessariamente um booleano:
`nil or "x"` → `x`. E faz **curto-circuito**: se a esquerda é verdadeira, a direita nem é avaliada.

## O que você vai aprender

- avaliação em curto-circuito.

## O que fazer

Novo nível na gramática, abaixo da atribuição: `logic_or → logic_and ( "or" logic_and )*`. Avalie
a esquerda; se verdadeira, devolva-a sem avaliar a direita.

## Como o tester valida

- valores devolvidos por `or`;
- uma atribuição no lado direito só pode acontecer se a esquerda for falsa.

## Critério de conclusão

`or` funciona com curto-circuito.
