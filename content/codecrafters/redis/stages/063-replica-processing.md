Do lado da réplica: os comandos que chegam do master são **executados em silêncio** (sem
resposta para o master). Clientes da réplica passam a ver os dados.

## O que você vai aprender

- consistência eventual.

## O que fazer

Depois do RDB, continue lendo comandos da conexão com o master e execute-os sem responder.

## Como o tester valida

- o master falso envia `SET`s (às vezes no mesmo pacote do RDB); um cliente da réplica lê os valores.

## Dicas

- O RDB e os primeiros comandos podem chegar juntos: leia o RDB pelo tamanho, sem descartar o resto do buffer.

## Critério de conclusão

A réplica processa os comandos.
