Nomes de variáveis começam com letra ou `_` e continuam com letras, dígitos ou `_`. Fora
disso:

## O que você vai aprender

- a validar identificadores sem regex (um laço basta).

## O que fazer

Nome inválido: `declare: '<argumento>': not a valid identifier` — o argumento inteiro entre
aspas simples.

## Como o tester valida

- `declare 1abc=x` e `declare a-b=1` → erro;
- `declare _ok9=sim` → válido.

## Critério de conclusão

Nomes inválidos são recusados.
