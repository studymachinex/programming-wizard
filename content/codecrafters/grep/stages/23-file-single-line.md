Depois do padrão podem vir **arquivos**: o grep lê deles em vez do stdin.

## O que você vai aprender

- a separar "de onde vêm as linhas" de "como avaliar cada linha".

## O que fazer

Se houver argumentos depois do padrão, leia cada um como arquivo. Com um único arquivo, a
saída é igual à do stdin (sem prefixo).

## Como o tester valida

- `./your_program.sh -E '^<início>' fruits.txt` com um arquivo de uma linha;
- um padrão que não casa: saída vazia e código 1.

## Critério de conclusão

O grep busca em um arquivo.
