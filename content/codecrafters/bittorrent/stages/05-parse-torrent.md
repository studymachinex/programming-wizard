Um arquivo `.torrent` é um dicionário bencodado. Implemente o comando `info`:

```bash
$ ./your_program.sh info exemplo.torrent
Tracker URL: http://127.0.0.1:6969/announce
Length: 101458
```

## O que você vai aprender

- o que um `.torrent` descreve: **onde** achar peers e **como** verificar o arquivo;
- a ler um arquivo binário inteiro e decodificá-lo.

## O formato

```text
{
  "announce": "http://tracker/announce",     ← URL do tracker
  "info": {
    "length": 101458,                           ← tamanho do arquivo em bytes
    "name": "exemplo.bin",
    "piece length": 32768,                     ← tamanho de cada peça
    "pieces": <20 bytes de SHA-1 por peça>
  }
}
```

Este desafio usa torrents de **um arquivo só** (com `length` dentro de `info`).

## O que fazer

1. Leia o arquivo com `Files.readAllBytes` e decodifique.
2. Imprima `Tracker URL: <announce>` e `Length: <info.length>`.

## Como o tester valida

- gera um `.torrent` com tracker e tamanho aleatórios;
- procura as linhas `Tracker URL:` e `Length:` na saída.

## Dicas

- `pieces` é binário: decodificar strings como `String` UTF-8 corrompe esses bytes. Mantenha
  `byte[]`.

## Critério de conclusão

`info` imprime o tracker e o tamanho do arquivo.
