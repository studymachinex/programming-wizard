Depois do `+PONG`, a réplica manda dois `REPLCONF` (esperando `+OK` de cada):

- `REPLCONF listening-port <porta da réplica>`
- `REPLCONF capa psync2`

## O que você vai aprender

- negociação de capacidades.

## O que fazer

Mande os dois comandos, lendo a resposta de cada um.

## Como o tester valida

- confere os dois comandos e a porta.

## Critério de conclusão

A réplica envia os REPLCONF.
