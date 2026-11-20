Agora o padrão é uma **sequência**: `\d apple` casa com um dígito, seguido de espaço,
seguido de `apple`.

## O que você vai aprender

- o algoritmo básico de busca: para cada posição de início, tente casar a sequência inteira;
- por que uma falha no meio faz você tentar a próxima posição.

## O que fazer

1. Transforme o padrão em uma lista de itens.
2. Para cada posição de início na entrada, tente casar todos os itens em sequência.
3. Se algum início funcionar, casou.

## Como o tester valida

- `\d apple` contra `sally has 3 apples` casa; contra `sally has 1 dog` não;
- `\d\d\d apples` e `\d \w\w\ws` com entradas que casam e que não casam.

## Dicas

- Escreva `matchHere(itens, i, texto, pos)`: ele cresce bastante nos próximos stages.

## Critério de conclusão

Sequências de literais e classes funcionam.
