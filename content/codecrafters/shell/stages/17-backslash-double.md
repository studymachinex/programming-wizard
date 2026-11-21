Dentro de aspas duplas, a barra só escapa três caracteres: `\`, `"` e `$`. Antes de qualquer
outro ela é literal.

## O que você vai aprender

- a regra de escape mais sutil do shell.

## O que fazer

No modo de aspas duplas: se vier `\` seguido de `\`, `"` ou `$`, adicione só o segundo caractere;
senão, adicione a barra normalmente.

## Como o tester valida

- `echo "a\"b\""` → `a"b"`;
- `echo "a\\b"` → `a\b`;
- `echo "a\nb"` → `a\nb`;
- `echo "a\'b"` → `a\'b`;
- `echo "\$x"` → `$x`.

## Critério de conclusão

Barras dentro de aspas duplas seguem as regras do sh.
