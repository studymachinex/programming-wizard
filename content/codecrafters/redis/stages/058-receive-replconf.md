Agora o outro lado: o **master** recebendo uma réplica. Responda `+OK` aos `REPLCONF`.

## O que você vai aprender

- o lado servidor do handshake.

## O que fazer

Implemente `REPLCONF` respondendo `+OK`.

## Como o tester valida

- uma réplica falsa manda `PING` e os dois `REPLCONF`.

## Dicas

- Nos stages de replicação o próprio tester faz o papel do outro lado: um master falso (para testar a sua réplica) ou réplicas falsas (para testar o seu master).

## Critério de conclusão

O master aceita os REPLCONF.
