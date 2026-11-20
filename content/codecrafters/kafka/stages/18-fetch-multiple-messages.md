O log pode ter **vários batches**.

## O que fazer

Devolva todos os batches a partir de `fetch_offset` (o tester pede a partir do 0, então o
arquivo inteiro).

## Como o tester valida

- grava dois batches (5 mensagens) na partição 1 de um tópico e confere `records`.

## Dicas

- Para respeitar `fetch_offset`, pule batches cujo último offset
  (`baseOffset + lastOffsetDelta`) seja menor que ele.

## Critério de conclusão

O Fetch entrega todos os batches do log.
