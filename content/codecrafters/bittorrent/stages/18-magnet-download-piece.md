Com os metadados em mãos, baixe uma peça a partir do magnet link:

```bash
$ ./your_program.sh magnet_download_piece -o /tmp/piece-0 "<magnet>" 0
```

## O que você vai aprender

- que, depois dos metadados, o download é idêntico ao do `.torrent`;
- a reaproveitar a mesma conexão para metadados e peças.

## O que fazer

1. Faça o fluxo de magnet até os metadados (stages 12–17).
2. Na mesma conexão: interested → unchoke → requests de blocos (stage 10).
3. Confira o hash e grave em `-o`.

## Como o tester valida

- baixa a última peça (a menor) e compara byte a byte.

## Critério de conclusão

`magnet_download_piece` baixa uma peça a partir de um magnet link.
