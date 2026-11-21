Vários clientes ficam conectados ao mesmo tempo e mandam comandos intercalados.

## O que você vai aprender

- concorrência com uma thread por cliente.

## O que fazer

Para cada conexão aceita, crie uma thread que roda o laço de comandos.

## Como o tester valida

- três clientes conectados mandando `PING` em ordem embaralhada.

## Dicas

- Os dados vão ser compartilhados entre threads: proteja-os com um lock (um lock global é suficiente para o desafio).

## Critério de conclusão

O servidor atende vários clientes ao mesmo tempo.
