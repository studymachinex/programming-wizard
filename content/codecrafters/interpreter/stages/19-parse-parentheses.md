Parênteses agrupam: `("x")` → `(group x)`; `((true))` → `(group (group true))`.

## O que você vai aprender

- recursão no parser: dentro dos parênteses há outra expressão.

## O que fazer

Em `primary`, ao ver `(`, parseie uma `expression()` e exija `)`.

## Como o tester valida

- grupos simples e aninhados.

## Critério de conclusão

Parênteses são parseados.
