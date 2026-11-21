No escopo global, redeclarar uma variável é permitido: a nova declaração substitui a antiga.
O inicializador pode usar o valor anterior.

## O que você vai aprender

- por que globais são mais permissivas (facilitam o uso interativo).

## O que fazer

`define` simplesmente sobrescreve.

## Como o tester valida

- `var a = 1; var a = 2;`, `var a = "x"; var a;` e `var a = a + 1;`.

## Critério de conclusão

Redeclaração global funciona.
