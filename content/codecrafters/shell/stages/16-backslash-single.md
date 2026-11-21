Entre aspas simples **nada** é especial — nem a barra invertida.

## O que você vai aprender

- a garantir que cada modo de quoting tenha suas próprias regras.

## O que fazer

Confira que o modo de aspas simples não trata `\`.

## Como o tester valida

- `echo 'a\nb'` → `a\nb`;
- `echo 'a\\b'` → `a\\b`;
- `echo 'c:\x\"y\"'` → `c:\x\"y\"`.

## Critério de conclusão

Barras dentro de aspas simples ficam como estão.
