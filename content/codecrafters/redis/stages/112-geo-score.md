O score de cada lugar é o seu **geohash** de 52 bits. `ZSCORE` deve devolver exatamente esse
número.

## O que você vai aprender

- geohash: transformar duas dimensões em uma, preservando proximidade.

## O que fazer

Implemente a codificação e use-a como score.

## Como o tester valida

- `ZSCORE` de cada lugar comparado com o geohash esperado.

## Dicas

- Geohash do Redis: normalize a latitude em [-85.05112878, 85.05112878] e a longitude em [-180, 180] para [0, 1), multiplique por 2^26 e trunque; intercale os bits — latitude nos bits pares, longitude nos ímpares. O score é esse número de 52 bits.

## Critério de conclusão

O score é o geohash.
