Agora entregue mensagens de verdade. O log da partição contém **record batches** no mesmo
formato do log de metadados (stage 10).

## O que você vai aprender

- *zero-copy*: o broker não precisa decodificar as mensagens, só copiar os bytes do disco
  para a rede — uma das razões de o Kafka ser rápido.

## O que fazer

1. Leia o arquivo de log da partição.
2. Coloque os bytes, como estão, no campo `records` da resposta.

## Como o tester valida

- grava um record batch com uma mensagem no log da partição;
- confere que `records` traz exatamente esses bytes.

## Critério de conclusão

O Fetch entrega a mensagem gravada em disco.
