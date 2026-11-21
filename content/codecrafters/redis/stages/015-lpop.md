`LPOP chave` remove e devolve o primeiro elemento (bulk string), ou nulo (`$-1`) se a lista não
existir. Uma lista que fica vazia deixa de existir.

## O que você vai aprender

- remoção em estruturas compartilhadas.

## O que fazer

Remova do início; se esvaziar, apague a chave.

## Como o tester valida

- `LPOP`, `LRANGE` depois, e `LPOP` de chave inexistente.

## Critério de conclusão

`LPOP` funciona.
