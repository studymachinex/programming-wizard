`history -w <arquivo>` grava todo o histórico, um comando por linha (cada linha terminada
em `\n`), sobrescrevendo o arquivo.

## O que você vai aprender

- a escolher entre sobrescrever e acrescentar.

## O que fazer

Grave todas as entradas, incluindo o próprio `history -w`.

## Como o tester valida

- dois comandos e `history -w salvo.txt`; confere o arquivo.

## Dicas

- Use `\n` explicitamente (não `System.lineSeparator()`) para o arquivo ser igual em todos os sistemas.

## Critério de conclusão

`history -w` funciona.
