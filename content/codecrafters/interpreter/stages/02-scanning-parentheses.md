Os primeiros tokens de verdade: parênteses. Tokens sem valor literal mostram `null` no fim.

```
$ cat parens.lox
(()
$ ./your_program.sh tokenize parens.lox
LEFT_PAREN ( null
LEFT_PAREN ( null
RIGHT_PAREN ) null
EOF  null
```

## O que você vai aprender

- a percorrer o código caractere a caractere.

## O que fazer

Para cada `(` imprima `LEFT_PAREN ( null`; para `)`, `RIGHT_PAREN ) null`.

## Como o tester valida

- sequências aleatórias de `(` e `)`, sem espaços.

## Critério de conclusão

Parênteses viram tokens.
