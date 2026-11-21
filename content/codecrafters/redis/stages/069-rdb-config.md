O Redis salva snapshots em arquivos **RDB**. As opções `--dir` e `--dbfilename` dizem onde.
`CONFIG GET dir` devolve `[dir, <valor>]`.

## O que você vai aprender

- configuração consultável em tempo de execução.

## O que fazer

Leia as opções e implemente `CONFIG GET <parâmetro>`.

## Como o tester valida

- `CONFIG GET dir` e `CONFIG GET dbfilename`.

## Critério de conclusão

`CONFIG GET` funciona.
