Se nenhum comando de escrita foi propagado, todas as réplicas estão em dia: `WAIT` responde na
hora com o número de réplicas conectadas.

## O que você vai aprender

- atalhos quando não há trabalho pendente.

## O que fazer

Se o offset do master é 0, responda imediatamente.

## Como o tester valida

- N réplicas conectadas, `WAIT N 5000` → `:N` imediatamente.

## Critério de conclusão

`WAIT` responde na hora sem escritas.
