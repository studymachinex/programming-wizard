O arquivo é dividido em **peças** de tamanho fixo, e o torrent guarda o SHA-1 de cada uma.
Complete o `info`:

```text
Piece Length: 32768
Piece Hashes:
4b0f7e1c9a2d58e3f6c1b7a90d2e4f8a1c3b5d70
a9d3c2e17f0b4e5a8c6d1f2e3b9a7c4d0e5f6a12
...
```

## O que você vai aprender

- por que o BitTorrent verifica cada peça separadamente: dá para baixar de peers diferentes
  e descartar só a peça corrompida;
- a fatiar um campo binário em blocos de tamanho fixo.

## O que fazer

1. Imprima `Piece Length: <info["piece length"]>`.
2. Imprima `Piece Hashes:` e, em seguida, `pieces` cortado em blocos de 20 bytes, cada um em
   hexadecimal, um por linha.

## Como o tester valida

- confere `Piece Length` e a lista de hashes, na ordem.

## Dicas

- A quantidade de peças é `pieces.length / 20`. A última peça costuma ser menor que
  `piece length`.

## Critério de conclusão

`info` imprime o tamanho das peças e todos os hashes.
