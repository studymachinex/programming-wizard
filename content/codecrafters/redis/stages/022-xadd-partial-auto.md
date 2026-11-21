Com `<ms>-*`, o servidor escolhe a sequência: se o tempo for igual ao do último ID, `última + 1`;
senão `0` — exceto com tempo `0`, em que a primeira sequência é `1` (porque `0-0` é inválido).

## O que você vai aprender

- geração de IDs.

## O que fazer

Implemente as regras acima.

## Como o tester valida

- `0-*` → `0-1`; `N-*` → `N-0` e depois `N-1`; outro stream com `N-*` → `N-0`.

## Critério de conclusão

IDs parcialmente automáticos funcionam.
