`echo` imprime os argumentos separados por um espaço, seguidos de uma quebra de linha.

```
$ echo manga azul figo
manga azul figo
```

## O que você vai aprender

- a separar a linha em palavras (*tokenização* simples, por espaços).

## O que fazer

Divida a linha por espaços: a primeira palavra é o comando, o resto são os argumentos. Para
`echo`, imprima `String.join(" ", argumentos)`.

## Como o tester valida

- `echo <três palavras>` e `echo <uma palavra>`;
- confere a linha impressa.

## Dicas

- Espaços repetidos entre argumentos viram um só — o stage 13 testa isso explicitamente.

## Critério de conclusão

`echo` imprime os argumentos.
