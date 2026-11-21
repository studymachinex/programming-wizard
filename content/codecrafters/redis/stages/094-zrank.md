`ZRANK chave membro` devolve a posição (a partir de 0) na ordem do sorted set, ou nulo se o membro
ou a chave não existirem.

## O que você vai aprender

- consulta de posição.

## O que fazer

Conte quantos membros vêm antes.

## Como o tester valida

- o rank de cada membro (com empates de score) e membros inexistentes.

## Dicas

- Ordem de um sorted set: por score crescente; scores iguais ficam em ordem lexicográfica do membro.

## Critério de conclusão

`ZRANK` funciona.
