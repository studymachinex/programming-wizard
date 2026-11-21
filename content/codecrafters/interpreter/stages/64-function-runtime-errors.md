Erros de chamada:

- chamar algo que não é função: `Can only call functions and classes.`
- número errado de argumentos: `Expected 2 arguments but got 1.`

## O que você vai aprender

- checagem de aridade.

## O que fazer

Valide o *callee* e a aridade antes de chamar. O erro aponta a linha do `)` da chamada.

## Como o tester valida

- chamar string, poucos e muitos argumentos, erro dentro da função.

## Dicas

- Erros de execução: imprima a mensagem no stderr e, na linha seguinte, `[line N]`; termine com código **70**.

## Critério de conclusão

Erros de chamada são reportados.
