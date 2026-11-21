Ao sair com `exit`, o shell grava o histórico em `HISTFILE`.

## O que você vai aprender

- a executar tarefas de encerramento.

## O que fazer

No `exit`, grave as entradas da sessão no `HISTFILE` (criando o arquivo se precisar),
incluindo o próprio `exit`.

## Como o tester valida

- `HISTFILE` apontando para um arquivo inexistente; dois comandos e `exit`; confere o arquivo.

## Critério de conclusão

O histórico é gravado no `exit`.
