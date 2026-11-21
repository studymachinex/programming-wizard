Números inteiros são impressos **sem** casa decimal; os demais, normalmente.

## O que você vai aprender

- a diferença entre representação interna e apresentação.

## O que fazer

No `stringify`, se o texto do double terminar em `.0`, remova o sufixo.

## Como o tester valida

- strings, `42`, `42.50` → `42.5`, `42.000` → `42`.

## Critério de conclusão

Strings e números são avaliados.
