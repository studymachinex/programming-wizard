O número de um novo job é **o maior número em uso + 1** — ou 1 se não houver jobs. Assim,
números de jobs removidos voltam a ser usados.

## O que você vai aprender

- a calcular identificadores a partir do estado atual.

## O que fazer

Calcule o próximo número a partir da lista atual, não de um contador global.

## Como o tester valida

- jobs 1 (longo) e 2 (curto); depois que o 2 é colhido, o novo job recebe o número 2;
- sem jobs na lista, o próximo volta a ser 1.

## Critério de conclusão

Números de jobs são reaproveitados.
