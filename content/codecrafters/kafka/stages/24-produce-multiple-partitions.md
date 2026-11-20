Um request pode produzir para **várias partições** de um tópico.

## O que fazer

Trate cada item de `partition_data` de forma independente, gravando no log da sua
partição, e responda um item em `partition_responses` para cada um.

## Como o tester valida

- produz para as partições 2 e 0 de um tópico com 3 partições;
- confere as respostas e os dois arquivos, e que a partição 1 não mudou.

## Critério de conclusão

O broker grava em várias partições no mesmo request.
