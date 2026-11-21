`return expressão;` encerra a função devolvendo o valor (`return;` devolve `nil`), mesmo de
dentro de laços e `if`s aninhados.

## O que você vai aprender

- como desenrolar a pilha de execução.

## O que fazer

Implemente `return` lançando uma exceção com o valor e capturando-a no `call` da função.

## Como o tester valida

- multiplicação, retorno antecipado, `return;` e um Fibonacci recursivo.

## Dicas

- Crie a exceção sem *stack trace* (`super(null, null, false, false)`) — ela é usada como controle de fluxo, não como erro.

## Critério de conclusão

`return` funciona.
