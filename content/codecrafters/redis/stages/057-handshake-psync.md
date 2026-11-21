Por fim, `PSYNC ? -1` ("não conheço nenhum histórico; me mande tudo"). O master responde
`+FULLRESYNC <id> <offset>` e em seguida um RDB: `$<tamanho>\r\n` + os bytes (**sem** `\r\n` no fim).

## O que você vai aprender

- sincronização completa (full resync).

## O que fazer

Mande o `PSYNC`, leia a linha `+FULLRESYNC` e consuma o RDB (leia exatamente `<tamanho>` bytes).

## Como o tester valida

- o master falso confere o handshake inteiro.

## Critério de conclusão

O handshake da réplica está completo.
