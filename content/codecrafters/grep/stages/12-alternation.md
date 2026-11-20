`(cat|dog)` casa com `cat` **ou** com `dog`. Os parênteses formam um **grupo**, e `|`
separa as alternativas.

## O que você vai aprender

- a transformar o padrão em uma **árvore** (grupos dentro de grupos), não em uma lista;
- que, com backtracking, a primeira alternativa que leva a um match completo vence.

## O que fazer

1. Faça o parse recursivo: um grupo contém alternativas; cada alternativa é uma sequência.
2. Para casar um grupo, tente cada alternativa em ordem, seguida do resto do padrão.

## Como o tester valida

- `(<animal>|<fruta>)` contra frases que contêm uma delas ou nenhuma;
- `^I see \d+ (cat|dog)s?$`.

## Dicas

- Trate o padrão inteiro como um grupo de nível zero: o código fica uniforme.
- Numere os grupos pela ordem do `(`: você vai precisar disso nas backreferences.

## Critério de conclusão

Grupos e alternação funcionam.
