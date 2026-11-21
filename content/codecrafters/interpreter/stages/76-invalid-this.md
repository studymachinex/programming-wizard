`this` fora de um método: `Can't use 'this' outside of a class.` (65).

## O que você vai aprender

- mais contexto no resolver.

## O que fazer

Rastreie se o resolver está dentro de uma classe.

## Como o tester valida

- `this` no topo e numa função comum.

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.

## Critério de conclusão

Usos inválidos de `this` são detectados.
