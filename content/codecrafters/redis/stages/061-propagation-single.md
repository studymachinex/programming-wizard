Depois do handshake, todo comando de **escrita** executado no master (`SET`, `INCR`, `RPUSH`...) é
reenviado à réplica, no formato de array RESP. Leituras (`GET`) não são propagadas.

## O que você vai aprender

- replicação por propagação de comandos.

## O que fazer

Após executar um comando de escrita, escreva-o (como array RESP) em cada conexão de réplica.

## Como o tester valida

- três `SET` e um `GET` de um cliente; a réplica recebe só os `SET`, em ordem.

## Critério de conclusão

Comandos chegam à réplica.
