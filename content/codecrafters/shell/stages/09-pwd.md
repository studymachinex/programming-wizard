`pwd` (*print working directory*) imprime o caminho absoluto do diretório atual.

## O que você vai aprender

- que o diretório atual é estado do shell (por isso `cd` precisa ser builtin).

## O que fazer

Mantenha um `Path cwd` (comece com `Paths.get("").toAbsolutePath()`) e imprima-o.

## Como o tester valida

- `type pwd` deve dizer que é builtin;
- `pwd` deve imprimir o diretório em que o tester iniciou o shell.

## Critério de conclusão

`pwd` mostra o diretório atual.
