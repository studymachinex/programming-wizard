`PUBLISH canal mensagem` responde quantos clientes assinam o canal.

## O que você vai aprender

- índices de assinantes por canal.

## O que fazer

Mantenha um mapa canal → conexões.

## Como o tester valida

- `PUBLISH` sem assinantes → `:0`; com dois → `:2`.

## Critério de conclusão

`PUBLISH` conta assinantes.
