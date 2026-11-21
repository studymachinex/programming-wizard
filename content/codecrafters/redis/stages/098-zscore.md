`ZSCORE chave membro` devolve o score como **bulk string** (inteiros sem `.0`: `20`, `35.5`), ou
nulo.

## O que você vai aprender

- formatação de números de ponto flutuante.

## O que fazer

Formate o double sem casas desnecessárias e sem notação científica.

## Como o tester valida

- o score de cada membro (comparado numericamente) e membro inexistente.

## Dicas

- `BigDecimal.valueOf(score).stripTrailingZeros().toPlainString()` resolve a formatação.

## Critério de conclusão

`ZSCORE` funciona.
