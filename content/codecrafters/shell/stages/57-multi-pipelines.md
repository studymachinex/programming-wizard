Generalize para N comandos.

## O que você vai aprender

- a encadear N estágios sem casos especiais.

## O que fazer

Itere pelos comandos ligando a saída de cada um à entrada do seguinte.

## Como o tester valida

- `cat dados.txt | head -n 3 | wc`;
- `ticker | head -n 5 | head -n 2` (precisa terminar);
- `cat dados.txt | cat | head -n 2`.

## Critério de conclusão

Pipelines de qualquer tamanho funcionam.
