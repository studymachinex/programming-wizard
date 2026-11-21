Com quebras de linha no código, o número da linha dos erros precisa estar certo.

```
$ printf '()\n\t@' > erro.lox
$ ./your_program.sh tokenize erro.lox
[line 2] Error: Unexpected character: @
LEFT_PAREN ( null
RIGHT_PAREN ) null
EOF  null
```

## O que você vai aprender

- a rastrear posição no código-fonte.

## O que fazer

Use o contador de linha nas mensagens `[line N] Error: ...`.

## Como o tester valida

- caracteres inválidos espalhados por várias linhas.

## Critério de conclusão

Erros léxicos apontam a linha certa.
