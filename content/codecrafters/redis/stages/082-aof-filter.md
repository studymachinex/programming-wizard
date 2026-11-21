Comandos de leitura (`GET`, `PING`, `ECHO`, `TYPE`...) não vão para o AOF.

## O que você vai aprender

- classificação de comandos.

## O que fazer

Mantenha uma lista dos comandos de escrita (a mesma da propagação para réplicas).

## Como o tester valida

- mistura de leituras e escritas; só `SET` e `INCR` no arquivo.

## Critério de conclusão

Só escritas são gravadas.
