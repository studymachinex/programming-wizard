Todo número em Lox é ponto flutuante (double). O lexema é o texto original; o literal é o
valor formatado como double — sempre com pelo menos uma casa decimal: `42` → `42.0`,
`200.00` → `200.0`, `3.14` → `3.14`.

```
NUMBER 42 42.0
NUMBER 200.00 200.0
NUMBER 1234.5678 1234.5678
```

## O que você vai aprender

- a reconhecer números e converter texto em valor.

## O que fazer

Uma sequência de dígitos, opcionalmente seguida de `.` e **mais dígitos**. `1.` é o número `1`
seguido de `DOT`; `.5` é `DOT` seguido de `5`.

## Como o tester valida

- inteiros, decimais, `.00`, e os casos `9.` e `.9`.

## Dicas

- `Double.parseDouble` + `Double.toString` dão exatamente o formato esperado (`42.0`, `1.5`).

## Critério de conclusão

Números são reconhecidos.
