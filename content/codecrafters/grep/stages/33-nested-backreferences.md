Grupos podem estar **dentro** de outros: em `('(cat) and \2') is the same as \1`, o grupo 1
é o externo e o grupo 2 é o `(cat)` de dentro.

## O que você vai aprender

- que a numeração segue a posição do `(`, não o nível de aninhamento.

## O que fazer

Garanta que capturas de grupos internos e externos coexistam e possam ser referenciadas.

## Como o tester valida

- `('(<animal>) and \2') is the same as \1` com textos que casam e que não casam;
- `((\w\w\w\w) (\d\d\d)) is doing \2 \3 times, and again \1 times`.

## Dicas

- Para ir além: classes como `\s`, quantificadores preguiçosos (`*?`) e a flag `-i`.

## Critério de conclusão

Backreferences para grupos aninhados funcionam — o motor está completo.
