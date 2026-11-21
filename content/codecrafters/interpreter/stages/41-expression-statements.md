Uma expressão seguida de `;` também é um statement: é avaliada e o valor é descartado. Erros de
execução nelas interrompem o programa.

## O que você vai aprender

- statements de expressão (úteis para chamadas e atribuições).

## O que fazer

`exprStmt → expression ";"`. Sem `;`: `Expect ';' after expression.`

## Como o tester valida

- expressões soltas antes de um `print`;
- erro de execução numa expressão solta (código 70).

## Dicas

- Erros de execução: imprima a mensagem no stderr e, na linha seguinte, `[line N]`; termine com código **70**.

## Critério de conclusão

Expressões como statements funcionam.
