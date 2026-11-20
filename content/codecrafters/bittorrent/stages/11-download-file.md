Junte tudo: implemente `download`, que baixa todas as peças e monta o arquivo.

```bash
$ ./your_program.sh download -o /tmp/exemplo.bin exemplo.torrent
```

## O que você vai aprender

- que um download BitTorrent é só "baixar cada peça e concatenar";
- onde estão as oportunidades de paralelismo de um cliente real.

## O que fazer

1. Para cada índice de `0` até o número de peças − 1, baixe a peça (stage 10).
2. Concatene na ordem e grave em `-o`.

## Como o tester valida

- sobe 3 peers com o arquivo completo;
- compara o arquivo gravado com o original, byte a byte.

## Dicas

- Reaproveite a mesma conexão para todas as peças: handshake, interested e unchoke só uma vez.
- Para ir além: baixe peças de vários peers em paralelo (uma thread por conexão, uma fila de
  índices). O tester aceita as duas abordagens.

## Critério de conclusão

`download` grava o arquivo completo e íntegro.
