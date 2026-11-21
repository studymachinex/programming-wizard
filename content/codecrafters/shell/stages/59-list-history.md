Cada linha não vazia digitada entra no histórico — inclusive comandos inválidos e o próprio
`history`.

```
$ echo manga
manga
$ history
    1  echo manga
    2  history
```

## O que você vai aprender

- em que momento registrar um comando (antes de executá-lo).

## O que fazer

Adicione cada linha ao histórico antes de executá-la. `history` imprime todas, numeradas a partir de 1.

## Como o tester valida

- três comandos e depois `history`.

## Dicas

- Formato do `history`: número alinhado à direita em 5 colunas, dois espaços e o comando — `String.format("%5d  %s", n, comando)`.

## Critério de conclusão

`history` lista os comandos.
