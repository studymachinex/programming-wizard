Tópicos com **várias partições**.

## O que fazer

Inclua todas as partições do tópico na resposta, **ordenadas por `partition_index`**.

## Como o tester valida

- gera um tópico com 2 a 4 partições e confere cada uma, na ordem.

## Dicas

- Um `TreeMap<Integer, Partition>` por tópico mantém a ordem de graça.

## Critério de conclusão

Todas as partições aparecem, em ordem.
