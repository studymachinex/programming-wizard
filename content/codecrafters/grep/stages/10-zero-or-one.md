`?` torna o item anterior **opcional**: `dogs?` casa com `dog` e com `dogs`.

## O que você vai aprender

- que `?` é o caso `{0,1}` de um quantificador genérico.

## O que fazer

Tente primeiro casar o item (guloso); se o resto falhar, tente sem ele.

## Como o tester valida

- `<animal>s?`, `ca?t` contra `act` (casa: `ct` está lá) e `^ca?t$` contra `caat` (não casa).

## Dicas

- Se o seu `+` aceita mínimo e máximo, `?` é o mesmo código com `min = 0, max = 1`.

## Critério de conclusão

`?` funciona.
