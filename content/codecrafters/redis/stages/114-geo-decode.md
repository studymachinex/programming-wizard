As coordenadas devolvidas vêm do geohash: separe os bits e devolva o **centro** da célula. O
resultado é próximo, mas não igual, ao original.

## O que você vai aprender

- a precisão (e o erro) de um geohash.

## O que fazer

Separe os bits pares/ímpares, calcule os limites da célula e devolva o ponto médio.

## Como o tester valida

- `GEOPOS` de vários lugares comparado com o centro esperado (tolerância 1e-9).

## Dicas

- Geohash do Redis: normalize a latitude em [-85.05112878, 85.05112878] e a longitude em [-180, 180] para [0, 1), multiplique por 2^26 e trunque; intercale os bits — latitude nos bits pares, longitude nos ímpares. O score é esse número de 52 bits.

## Critério de conclusão

Coordenadas são decodificadas.
