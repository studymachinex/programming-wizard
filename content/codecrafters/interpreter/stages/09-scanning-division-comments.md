`/` é divisão (`SLASH`), mas `//` começa um **comentário** que vai até o fim da linha e não
gera token nenhum.

## O que você vai aprender

- a descartar trechos do código.

## O que fazer

Ao ver `/`: se o próximo for `/`, avance até o `\n` (sem consumi-lo); senão, emita `SLASH`.

## Como o tester valida

- um arquivo só com comentário (só `EOF  null`);
- operadores seguidos de `//comentário` com tokens depois — que devem ser ignorados.

## Critério de conclusão

Divisão e comentários funcionam.
