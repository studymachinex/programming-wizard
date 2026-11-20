`-r` busca em **todos os arquivos** de um diretório, recursivamente. O prefixo é o caminho
a partir do diretório passado.

## O que você vai aprender

- a percorrer árvores de diretórios (`Files.walk`).

## O que fazer

Com `-r`, para cada argumento que é diretório, percorra todos os arquivos dentro dele e
imprima `<caminho>:<linha>`, com `/` como separador (`dir/sub/arquivo.txt`).

## Como o tester valida

- `./your_program.sh -r -E pie dir/` com arquivos em `dir/`, `dir/sub/` e `dir/sub/deep/`;
- a ordem das linhas não importa.

## Dicas

- No Windows, troque `\` por `/` no caminho.
- Tire a `/` final do argumento antes de montar os caminhos (`dir/` → `dir/fruits.txt`).

## Critério de conclusão

`-r` busca em árvores de diretórios.
