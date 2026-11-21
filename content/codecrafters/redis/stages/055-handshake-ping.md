O **handshake** começa com a réplica conectando no master e mandando `PING` (como array RESP).

## O que você vai aprender

- o protocolo de replicação.

## O que fazer

Na inicialização com `--replicaof`, conecte no master e mande `*1\r\n$4\r\nPING\r\n`.

## Como o tester valida

- o master falso recebe o `PING`.

## Dicas

- Nos stages de replicação o próprio tester faz o papel do outro lado: um master falso (para testar a sua réplica) ou réplicas falsas (para testar o seu master).

## Critério de conclusão

A réplica inicia o handshake.
