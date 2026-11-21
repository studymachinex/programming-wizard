Depois de um `EXEC` (com sucesso ou não), as chaves deixam de ser observadas.

## O que você vai aprender

- o escopo do WATCH: uma transação.

## O que fazer

Limpe o WATCH no `EXEC`.

## Como o tester valida

- `WATCH`, transação executada, modificação, nova transação → executa.

## Critério de conclusão

`EXEC` limpa o WATCH.
