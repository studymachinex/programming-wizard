`EXEC` executa os comandos enfileirados, em ordem, e devolve um array com a resposta de cada um.

## O que você vai aprender

- respostas compostas.

## O que fazer

Execute cada comando (com o lock, sem intercalar) e junte as respostas num array.

## Como o tester valida

- `SET`, `INCR`, `INCR`, `SET`, `GET` → `[+OK, :11, :12, +OK, $12]`; outro cliente vê o resultado.

## Critério de conclusão

Transações executam.
