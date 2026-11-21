`GEODIST chave a b` devolve a distância em metros com 4 casas decimais, pela fórmula de
**haversine** com raio 6372797.560856 m, usando as coordenadas decodificadas. Membro inexistente → nulo.

## O que você vai aprender

- distâncias na superfície de uma esfera.

## O que fazer

Implemente haversine.

## Como o tester valida

- distância entre dois lugares (tolerância 0,01 m) e membro inexistente.

## Dicas

- `2 * R * asin(sqrt(sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)))`.

## Critério de conclusão

`GEODIST` funciona.
