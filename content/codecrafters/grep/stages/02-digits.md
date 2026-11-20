A primeira **classe de caracteres**: `\d` casa com qualquer dígito de `0` a `9`.

```bash
$ echo -n "apple123" | ./your_program.sh -E "\d"; echo $?
0
```

## O que você vai aprender

- que uma classe representa um conjunto de caracteres;
- a tratar sequências de escape (`\`) no padrão.

## O que fazer

Se o padrão for `\d`, a entrada casa se tiver algum dígito.

## Como o tester valida

- `apple123` casa com `\d`; `apple` não.

## Dicas

- Comece a pensar no padrão como uma lista de "itens" que casam com um caractere cada: um literal, `\d`...

## Critério de conclusão

`\d` casa com qualquer dígito.
