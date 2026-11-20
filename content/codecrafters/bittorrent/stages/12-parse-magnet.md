Um **magnet link** substitui o arquivo `.torrent`: traz só o info hash e, opcionalmente,
um tracker. Os metadados são baixados dos próprios peers (stages 13–17). Comece pelo
parse:

```bash
$ ./your_program.sh magnet_parse "magnet:?xt=urn:btih:8c1a2e4f0b7d93a6c5e1f2048d9b7a3e6c50f1d2&dn=exemplo.bin&tr=http%3A%2F%2F127.0.0.1%3A6969%2Fannounce"
Tracker URL: http://127.0.0.1:6969/announce
Info Hash: 8c1a2e4f0b7d93a6c5e1f2048d9b7a3e6c50f1d2
```

## O formato

Uma URI com parâmetros de query:

| Parâmetro | Significado |
|---|---|
| `xt` | `urn:btih:<info hash em hex>` |
| `dn` | nome do arquivo (opcional) |
| `tr` | URL do tracker, com percent-encoding |

## O que fazer

1. Separe a query (depois do `?`) por `&` e cada par por `=`.
2. Decodifique os valores (`URLDecoder.decode`).
3. Imprima `Tracker URL:` e `Info Hash:`.

## Como o tester valida

- gera um magnet aleatório e confere as duas linhas.

## Dicas

- Guarde o info hash também como os 20 bytes (`HexFormat.of().parseHex`): o tracker e o
  handshake precisam deles.

## Critério de conclusão

`magnet_parse` extrai tracker e info hash.
