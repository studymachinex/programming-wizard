O **AOF** (*append-only file*) grava cada comando de escrita num arquivo, para reconstruir os
dados depois. Padrões, consultáveis por `CONFIG GET`:

| parâmetro | padrão |
|---|---|
| `appendonly` | `no` |
| `appenddirname` | `appendonlydir` |
| `appendfilename` | `appendonly.aof` |
| `appendfsync` | `everysec` |

## O que você vai aprender

- persistência por log de comandos.

## O que fazer

Inclua os quatro parâmetros no `CONFIG GET`.

## Como o tester valida

- os quatro valores padrão.

## Critério de conclusão

As opções do AOF existem.
