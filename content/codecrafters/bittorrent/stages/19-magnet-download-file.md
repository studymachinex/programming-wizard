O último stage: o arquivo inteiro a partir de um magnet link.

```bash
$ ./your_program.sh magnet_download -o /tmp/exemplo.bin "<magnet>"
```

## O que você vai aprender

- que você agora tem um cliente BitTorrent funcional: de um link de texto até o arquivo.

## O que fazer

1. Metadados (stages 12–17).
2. Todas as peças, em ordem, na mesma conexão (stages 10–11).
3. Grave em `-o`.

## Como o tester valida

- sobe 3 peers e compara o arquivo gravado com o original, byte a byte.

## Dicas

- Para ir além: baixe de vários peers em paralelo, peça as peças mais raras primeiro
  (*rarest first*) e lide com peers que fazem choke no meio do download.

## Critério de conclusão

`magnet_download` baixa o arquivo completo a partir de um magnet link.
