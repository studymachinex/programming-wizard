Receba os metadados e complete `magnet_info`, com a mesma saída do comando `info`:

```bash
$ ./your_program.sh magnet_info "<magnet>"
Tracker URL: http://127.0.0.1:6969/announce
Length: 101458
Info Hash: 8c1a2e4f0b7d93a6c5e1f2048d9b7a3e6c50f1d2
Piece Length: 32768
Piece Hashes:
...
```

## O que você vai aprender

- a separar um dicionário bencodado de dados binários que vêm logo depois dele;
- por que conferir o hash: os metadados vêm de um desconhecido.

## O formato

A resposta é uma mensagem id 20 com o **seu** id de `ut_metadata` (stage 14). O payload:

```text
<seu id> d8:msg_typei1e5:piecei0e10:total_sizei134ee <o dicionário info, bencodado>
```

`msg_type: 1` é *data*. Logo depois do dicionário de cabeçalho vêm os bytes do `info`.

## O que fazer

1. Leia mensagens até chegar a resposta (id 20, extensão = o seu id).
2. Decodifique o cabeçalho e note **onde ele termina**: o resto do payload é o `info`.
3. Confira que o SHA-1 desses bytes é o info hash do magnet.
4. Decodifique o `info` e imprima como no stage 7 (o tracker vem do magnet).

## Como o tester valida

- confere `Tracker URL`, `Length`, `Info Hash`, `Piece Length` e os hashes das peças.

## Dicas

- O cursor do seu decoder (stage 3) já diz onde o cabeçalho terminou.

## Critério de conclusão

O cliente monta o torrent a partir de um magnet link.
