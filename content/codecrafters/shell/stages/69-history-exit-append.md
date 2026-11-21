Se o `HISTFILE` já tinha conteúdo (carregado no início), o `exit` deve **acrescentar** só os
comandos desta sessão — não duplicar o que já estava lá.

## O que você vai aprender

- a unir as peças: carregar, marcar o que já está salvo e acrescentar o resto.

## O que fazer

Ao carregar o `HISTFILE`, marque essas entradas como já gravadas (mesmo índice do `history -a`).
No `exit`, acrescente as entradas a partir desse índice.

## Como o tester valida

- `HISTFILE` com dois comandos; um comando novo e `exit`; o arquivo deve ter os dois antigos, o novo e `exit`.

## Critério de conclusão

O `exit` acrescenta só a sessão atual.
