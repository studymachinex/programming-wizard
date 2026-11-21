`ZADD` aceita vários pares e atualiza o score de membros existentes (sem contá-los como novos).
`TYPE` é `zset`.

## O que você vai aprender

- atualização mantendo a ordem.

## O que fazer

Ao atualizar, remova a posição antiga antes de inserir a nova.

## Como o tester valida

- vários pares → `:2`; atualização → `:0`; `TYPE` → `zset`.

## Critério de conclusão

`ZADD` atualiza membros.
