Erros:

- `class A < A {}`: `A class can't inherit from itself.` (65, no resolver);
- superclasse que não é classe: `Superclass must be a class.` (70, em execução).

## O que você vai aprender

- erros estáticos × dinâmicos na mesma construção.

## O que fazer

Faça as duas validações.

## Como o tester valida

- herdar de si mesma, de uma string e de uma função.

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.
- Erros de execução: imprima a mensagem no stderr e, na linha seguinte, `[line N]`; termine com código **70**.

## Critério de conclusão

Erros de herança são reportados.
