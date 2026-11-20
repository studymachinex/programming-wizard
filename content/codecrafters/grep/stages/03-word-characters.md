`\w` casa com um caractere de "palavra": letras ASCII (`a–z`, `A–Z`), dígitos e `_`.

## O que você vai aprender

- que `\w` é ASCII: letras acentuadas não entram.

## O que fazer

Se o padrão for `\w`, a entrada casa se tiver algum caractere de palavra.

## Como o tester valida

- `banana_7` casa; `$!?-+=#` não.

## Critério de conclusão

`\w` casa com letras, dígitos e `_`.
