O nome do programa também é uma palavra como outra qualquer — pode vir entre aspas.

## O que você vai aprender

- que a tokenização vale para o comando, não só para os argumentos.

## O que fazer

Se o seu código separava o comando antes de tokenizar, ajuste: tokenize a linha inteira e só
então use a primeira palavra como comando.

## Como o tester valida

- cria executáveis chamados `meu programa <id>` e `it's <id>`;
- roda `'meu programa <id>' <arg>`, `"it's <id>" <arg>` e `meu\ programa\ <id>`.

## Dicas

- No Windows o `ProcessBuilder` coloca aspas sozinho em argumentos com espaço.

## Critério de conclusão

Executáveis com nomes "difíceis" rodam.
