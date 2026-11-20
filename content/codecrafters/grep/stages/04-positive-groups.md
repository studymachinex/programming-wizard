Um **grupo de caracteres** `[abc]` casa com qualquer um dos caracteres entre colchetes.

## O que você vai aprender

- a montar uma classe a partir do texto do padrão;
- a ler até o `]` correspondente.

## O que fazer

Implemente `[...]` com uma lista de caracteres. Suporte também intervalos, como `[a-z]` —
eles aparecem nos próximos stages.

## Como o tester valida

- `[axz]` contra uma palavra que começa com `a` casa; `[xyz]` contra `apple` não.

## Dicas

- Represente cada item do padrão como um predicado `char → boolean`: literal, `\d`, `\w` e grupos viram a mesma coisa.

## Critério de conclusão

`[abc]` casa com qualquer caractere listado.
