O master pergunta quanto a réplica já processou com `REPLCONF GETACK *`. Essa é a única mensagem
do master que a réplica responde: `REPLCONF ACK <offset>`, onde o offset é o total de bytes de comandos
processados **antes** deste GETACK. Sem comandos: `ACK 0`.

## O que você vai aprender

- confirmações de replicação.

## O que fazer

Trate `REPLCONF GETACK` respondendo `*3 REPLCONF ACK <offset>`.

## Como o tester valida

- `GETACK` logo após o handshake → `REPLCONF ACK 0`.

## Critério de conclusão

A réplica responde ao GETACK.
