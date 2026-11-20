Com **mais de um arquivo**, cada linha impressa ganha o prefixo `nome:`, para você saber de
onde ela veio.

```bash
$ ./your_program.sh -E "s$" fruits.txt animals.txt
fruits.txt:pears
animals.txt:cats
```

## O que você vai aprender

- por que o formato de saída muda com a quantidade de entradas.

## O que fazer

Com dois ou mais arquivos, imprima `<arquivo>:<linha>`.

## Como o tester valida

- três arquivos, um deles sem nenhuma linha que case; a saída é comparada em qualquer ordem.

## Critério de conclusão

Buscas em vários arquivos indicam a origem de cada linha.
