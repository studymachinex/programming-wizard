`ZRANGE chave início fim` devolve os membros nessas posições, com as mesmas regras de limites do
`LRANGE`.

## O que você vai aprender

- reaproveitamento da lógica de fatiamento.

## O que fazer

Use a ordem do sorted set e fatie.

## Como o tester valida

- fatias, fim além do tamanho, início > fim, chave inexistente.

## Critério de conclusão

`ZRANGE` funciona.
