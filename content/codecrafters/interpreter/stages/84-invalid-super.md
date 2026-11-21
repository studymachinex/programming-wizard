Erros (65):

- fora de classe: `Can't use 'super' outside of a class.`
- em classe sem superclasse: `Can't use 'super' in a class with no superclass.`
- `super` sem método: `Expect '.' after 'super'.`

## O que você vai aprender

- a fechar a análise estática.

## O que fazer

Rastreie `SUBCLASS` no resolver.

## Como o tester valida

- os três casos.

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.
- Parabéns: você implementou uma linguagem completa — scanner, parser, resolver e interpretador com closures, classes e herança.

## Critério de conclusão

O interpretador está completo.
