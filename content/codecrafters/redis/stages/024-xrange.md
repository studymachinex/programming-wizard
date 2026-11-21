`XRANGE stream início fim` devolve as entradas com ID entre os limites (inclusive). Um limite sem
sequência vale `ms-0` no início e `ms-<máximo>` no fim.

## O que você vai aprender

- consultas por intervalo.

## O que fazer

Filtre as entradas e responda com um array de entradas.

## Como o tester valida

- intervalos com IDs completos e só com milissegundos.

## Dicas

- Cada entrada de stream é respondida como `[id, [campo1, valor1, campo2, valor2, ...]]`.

## Critério de conclusão

`XRANGE` funciona.
