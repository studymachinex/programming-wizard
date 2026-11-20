Uma **backreference** `\1` casa com **o mesmo texto** que o grupo 1 capturou —
não com o mesmo padrão. `(cat) and \1` casa com `cat and cat`, mas não com `cat and dog`.

## O que você vai aprender

- capturas: guardar início e fim do que cada grupo casou;
- por que backreferences tornam regex mais poderosas que autômatos finitos.

## O que fazer

1. Quando um grupo casa, guarde `[início, fim)` daquele grupo.
2. `\N` casa se o texto na posição atual começar com o texto capturado pelo grupo N.
3. No backtracking, desfaça as capturas que não levaram a um match.

## Como o tester valida

- `(<animal>) and \1`, `^(\w+) is \1$` com repetições iguais e diferentes.

## Dicas

- Grave a captura **antes** de chamar a continuação, e restaure se ela falhar.

## Critério de conclusão

`\1` funciona.
