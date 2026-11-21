`complete -p <nome>` mostra o registro de um nome. Se não houver:

## O que você vai aprender

- a consultar o mapa de registros.

## O que fazer

Sem registro: `complete: <nome>: no completion specification`.

## Como o tester valida

- `complete -p <nome aleatório>`.

## Critério de conclusão

`complete -p` avisa quando não há registro.
