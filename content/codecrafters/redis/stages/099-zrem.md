`ZREM chave membro` remove e devolve quantos membros foram removidos.

## O que você vai aprender

- remoção mantendo as estruturas sincronizadas.

## O que fazer

Remova do mapa e da estrutura ordenada.

## Como o tester valida

- remove um membro, tenta remover um inexistente, confere `ZCARD` e `ZRANGE`.

## Critério de conclusão

Sorted sets estão completos.
