O offset soma o tamanho em bytes de **todos** os comandos recebidos do master depois do RDB —
inclusive `PING` e os próprios `GETACK` anteriores.

## O que você vai aprender

- contabilidade de bytes.

## O que fazer

Conte os bytes de cada comando lido e some ao offset depois de processá-lo.

## Como o tester valida

- GETACK → ACK 0; depois PING + dois SET + GETACK → ACK com a soma exata dos bytes.

## Critério de conclusão

O offset está certo.
