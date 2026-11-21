`LPOP chave N` remove até N elementos e devolve um **array** com eles.

## O que você vai aprender

- respostas cujo tipo depende dos argumentos.

## O que fazer

Com o segundo argumento, devolva um array (no máximo o tamanho da lista).

## Como o tester valida

- `LPOP k 2`, depois `LPOP k 10` (mais do que existe) e `LLEN` → 0.

## Critério de conclusão

`LPOP` com contagem funciona.
