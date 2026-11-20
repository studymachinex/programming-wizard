`+` repete o item anterior **uma ou mais vezes**: `ca+t` casa com `cat`, `caaat`, mas não
com `ct`.

## O que você vai aprender

- quantificadores **gulosos**: consomem o máximo possível;
- **backtracking**: devolver caracteres quando o resto do padrão não casa.

## O que fazer

Para `x+`: case `x` uma vez e depois o máximo de vezes possível; tente casar o resto do
padrão a partir dali; se falhar, devolva uma repetição e tente de novo (até restar uma).

## Como o tester valida

- `ca+t`, `^abc_\d+_xyz$` e `ca+ts` com entradas que casam e que não casam.

## Dicas

- Exemplo que exige backtracking: `a+ab` contra `aaab` — o `a+` precisa devolver um `a`.
- Uma forma elegante: funções de continuação — `match(item, pos, resto)` só retorna `true` se o resto também casar.

## Critério de conclusão

`+` funciona, inclusive quando é preciso voltar atrás.
