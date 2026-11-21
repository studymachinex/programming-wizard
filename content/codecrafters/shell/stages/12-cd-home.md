`~` é um atalho para o diretório pessoal, que vem da variável de ambiente `HOME`.

## O que você vai aprender

- a primeira *expansão* do shell: substituir `~` antes de usar o caminho.

## O que fazer

Se o argumento for `~` ou começar com `~/`, troque o `~` por `System.getenv("HOME")`.
`cd` sem argumentos também vai para o `HOME`.

## Como o tester valida

- `cd ~` e `pwd`;
- `cd ~/<subdiretório>` e `pwd`.

## Dicas

- O tester define `HOME` — também no Windows, onde normalmente essa variável não existe.

## Critério de conclusão

`cd ~` leva ao `HOME`.
