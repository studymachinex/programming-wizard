`history -r <arquivo>` lê um arquivo (um comando por linha) e acrescenta as linhas ao
histórico.

## O que você vai aprender

- a persistir estado do shell em arquivos de texto.

## O que fazer

Leia as linhas não vazias e adicione ao histórico.

## Como o tester valida

- `history -r historico.txt` e `history`: o próprio `history -r`, as linhas do arquivo e o `history`.

## Dicas

- Formato do `history`: número alinhado à direita em 5 colunas, dois espaços e o comando — `String.format("%5d  %s", n, comando)`.

## Critério de conclusão

`history -r` funciona.
