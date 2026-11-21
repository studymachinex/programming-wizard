`MULTI` seguido de `EXEC` executa zero comandos: responde o array vazio `*0\r\n` e encerra a
transação.

## O que você vai aprender

- o ciclo de vida de uma transação.

## O que fazer

No `EXEC`, devolva o array de resultados (vazio) e saia do modo transação.

## Como o tester valida

- `MULTI`, `EXEC` → `*0`; outro `EXEC` → erro.

## Critério de conclusão

Transações vazias funcionam.
