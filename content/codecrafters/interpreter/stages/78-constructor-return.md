`init` sempre devolve `this` — inclusive com `return;` antecipado ou chamado diretamente
(`obj.init()`). `return <valor>;` num `init` é erro: `Can't return a value from an initializer.` (65).

## O que você vai aprender

- casos especiais de construtores.

## O que fazer

Marque a função como inicializador; no `call`, devolva `this` do ambiente da closure. No
resolver, rastreie `INITIALIZER`.

## Como o tester valida

- `return;` no init, `obj.init()` e `return "x"` no init.

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.

## Critério de conclusão

Construtores completos.
