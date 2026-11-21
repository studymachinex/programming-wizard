Durante a transação, cada comando responde `+QUEUED` e **não** é executado ainda.

## O que você vai aprender

- execução adiada.

## O que fazer

Guarde os comandos numa lista da conexão.

## Como o tester valida

- `SET` e `INCR` dentro de `MULTI` → `+QUEUED`; outro cliente ainda não vê o valor.

## Critério de conclusão

Comandos são enfileirados.
