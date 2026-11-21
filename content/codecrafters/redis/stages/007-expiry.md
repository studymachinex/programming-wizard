`SET chave valor PX 100` faz a chave expirar em 100 milissegundos (`EX` usa segundos). Depois
disso, `GET` devolve nulo.

## O que você vai aprender

- expiração preguiçosa: verificar o prazo na hora da leitura.

## O que fazer

Guarde o instante de expiração junto da chave. No acesso, se já passou, apague e devolva nulo.

## Como o tester valida

- `SET ... PX 150`, `GET` imediato, espera 250 ms, `GET` → nulo;
- `px` minúsculo também vale.

## Critério de conclusão

Chaves expiram.
