Algumas palavras são reservadas: `and class else false for fun if nil or print return super
this true var while`. Cada uma tem seu tipo de token (o nome em maiúsculas): `AND and null`.

## O que você vai aprender

- a separar palavras-chave de identificadores com uma tabela.

## O que fazer

Depois de ler um identificador, procure o texto num `Map` de palavras reservadas.

## Como o tester valida

- todas as palavras reservadas;
- maiúsculas (`AND` é identificador!) e palavras que só começam com uma reservada (`orchid`, `classy`).

## Critério de conclusão

O scanner está completo.
