Caminhos relativos partem do diretório atual: `./x`, `x/y`, `../..`.

## O que você vai aprender

- a resolver e **normalizar** caminhos (remover `.` e `..`).

## O que fazer

`cwd.resolve(argumento).normalize()` resolve os três casos.

## Como o tester valida

- `cd ./<dir>`, `cd <dir>/<dir>`, `cd ../..` e `cd ../<dir>/./<dir>`, sempre seguidos de `pwd`.

## Dicas

- Sem `normalize()` o `pwd` mostraria `.../a/b/../..`.

## Critério de conclusão

`cd` com caminhos relativos funciona.
