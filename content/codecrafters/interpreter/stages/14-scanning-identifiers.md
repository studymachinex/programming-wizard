Identificadores começam com letra ou `_` e continuam com letras, dígitos ou `_`. Token:
`IDENTIFIER nome null`.

## O que você vai aprender

- a regra do *maximal munch*: consuma o maior token possível.

## O que fazer

Ao ver letra ou `_`, consuma enquanto for alfanumérico ou `_`. Um número seguido de letras
(`9abc`) vira `NUMBER` + `IDENTIFIER`.

## Como o tester valida

- identificadores com `_` e dígitos, misturados com outros tokens.

## Critério de conclusão

Identificadores são reconhecidos.
