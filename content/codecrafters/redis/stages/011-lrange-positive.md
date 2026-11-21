`LRANGE chave início fim` devolve os elementos do índice `início` ao `fim` (inclusive) como array
de bulk strings. Fim além do tamanho é truncado; início depois do fim (ou além da lista) dá array vazio;
chave inexistente também.

```
> RPUSH frutas manga uva kiwi
:3
> LRANGE frutas 0 1
*2 $5 manga $3 uva
```

## O que você vai aprender

- fatiamento com limites inclusivos.

## O que fazer

Ajuste os limites e devolva a fatia.

## Como o tester valida

- fatias no meio, fim além do tamanho, início > fim, início além da lista, chave inexistente.

## Critério de conclusão

`LRANGE` funciona com índices positivos.
