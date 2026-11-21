Depois do `+FULLRESYNC`, o master envia o estado atual como RDB. Para o desafio basta um RDB vazio:
o cabeçalho `REDIS0011`, o byte `0xFF` (fim) e 8 bytes de checksum. Formato:
`$<tamanho>\r\n<bytes>` — sem `\r\n` no final.

## O que você vai aprender

- transferência de snapshot.

## O que fazer

Envie o RDB vazio logo após o `+FULLRESYNC` e guarde a conexão como réplica.

## Como o tester valida

- confere que o RDB começa com `REDIS` e que nada vem depois dele.

## Critério de conclusão

O master envia o RDB.
