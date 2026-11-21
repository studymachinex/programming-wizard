Chamadas de função: `callee(argumentos)`. A primeira função é **nativa** (implementada em
Java): `clock()` devolve os segundos desde a época Unix. Impressa, uma função nativa aparece como
`<native fn>`.

## O que você vai aprender

- a sintaxe de chamada e funções nativas.

## O que fazer

1. `call → primary ( "(" arguments? ")" )*` (abaixo de `unary`).
2. Uma interface `Callable` com `arity()` e `call(interpretador, argumentos)`.
3. Defina `clock` no ambiente global.

## Como o tester valida

- `clock() > 0`, diferenças de tempo e `print clock;`.

## Critério de conclusão

Chamadas e `clock()` funcionam.
