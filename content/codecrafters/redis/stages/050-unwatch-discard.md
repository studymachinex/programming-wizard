`DISCARD` também deixa de observar as chaves.

## O que você vai aprender

- consistência entre os caminhos de saída.

## O que fazer

Limpe o WATCH no `DISCARD`.

## Como o tester valida

- `WATCH`, `MULTI`, `DISCARD`, modificação, nova transação → executa.

## Critério de conclusão

`DISCARD` limpa o WATCH.
