`>>` **acrescenta** ao arquivo em vez de truncá-lo.

## O que você vai aprender

- os modos de abertura de arquivo (truncar × acrescentar).

## O que fazer

Reconheça `>>` e `1>>`. Programas: `Redirect.appendTo(arquivo)`. Builtins:
`new FileOutputStream(arquivo, true)`.

## Como o tester valida

- `echo a >> log.txt`, `echo b 1>> log.txt`, `ls pasta >> log.txt`;
- confere o arquivo e o `cat log.txt`.

## Critério de conclusão

`>>` acrescenta ao arquivo.
