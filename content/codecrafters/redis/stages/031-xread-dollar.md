Com `$` no lugar do ID, o servidor usa o **último ID do stream no momento da chamada**: o cliente
recebe só entradas novas.

## O que você vai aprender

- como consumidores começam a acompanhar um stream.

## O que fazer

Resolva `$` no início do comando (stream inexistente → `0-0`).

## Como o tester valida

- `XREAD BLOCK 0 STREAMS s $` recebe só a entrada adicionada depois;
- `$` num stream inexistente com timeout → `*-1`.

## Critério de conclusão

`$` funciona.
