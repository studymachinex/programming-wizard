Igualdade funciona entre quaisquer tipos, **sem conversão**: `1 == "1"` é `false`, `nil == false`
é `false`, `nil == nil` é `true`.

## O que você vai aprender

- igualdade estrita.

## O que fazer

`isEqual(a, b)`: os dois `nil` → `true`; um `nil` → `false`; senão `a.equals(b)`.

## Como o tester valida

- igualdades aleatórias entre strings, números, booleanos, `nil` e comparações.

## Critério de conclusão

Igualdade funciona.
