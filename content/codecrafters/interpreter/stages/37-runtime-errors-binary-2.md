O `+` tem mensagem própria: `Operands must be two numbers or two strings.`

## O que você vai aprender

- mensagens de erro específicas por operador.

## O que fazer

Se o `+` não for número+número nem string+string, lance esse erro.

## Como o tester valida

- string + número, `true + nil`, número − string.

## Dicas

- Erros de execução: imprima a mensagem no stderr e, na linha seguinte, `[line N]`; termine com código **70**.

## Critério de conclusão

Erros no `+` são reportados.
