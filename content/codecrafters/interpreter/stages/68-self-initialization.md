Num escopo local, `var a = a;` é erro: `Can't read local variable in its own initializer.`
(código 65).

## O que você vai aprender

- o estado "declarada mas não definida".

## O que fazer

No resolver: `declare` marca o nome como `false`, `define` como `true`. Ao resolver uma `Variable`
cujo nome está `false` no escopo atual, reporte o erro.

## Como o tester valida

- em bloco e em função.

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.

## Critério de conclusão

Auto-inicialização é detectada.
