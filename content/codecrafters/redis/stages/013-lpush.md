`LPUSH` insere no **início**. Com vários elementos, cada um vai para a frente na ordem dada:
`LPUSH k a b` resulta em `b a ...`.

## O que você vai aprender

- listas duplamente terminadas (deque).

## O que fazer

Use `addFirst` para cada argumento, na ordem.

## Como o tester valida

- `LPUSH k c`, `LPUSH k a b` e `LRANGE k 0 -1` → `b a c`.

## Critério de conclusão

`LPUSH` funciona.
