IDs precisam ser **estritamente crescentes**. Erros:

- `ERR The ID specified in XADD is equal or smaller than the target stream top item`
- `ERR The ID specified in XADD must be greater than 0-0` (para `0-0`)

## O que você vai aprender

- invariantes de um log ordenado.

## O que fazer

Compare o novo ID com o último (primeiro o tempo, depois a sequência).

## Como o tester valida

- ID igual ao último, ID menor e `0-0`.

## Critério de conclusão

IDs inválidos são recusados.
