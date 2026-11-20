Agora a resposta completa de **ApiVersions v4**, que lista as APIs que o broker suporta.

## O formato (v4)

```text
correlation_id                 INT32      (cabeçalho de resposta v0)
error_code                     INT16
api_keys                       COMPACT_ARRAY
  api_key                      INT16
  min_version                  INT16
  max_version                  INT16
  TAG_BUFFER
throttle_time_ms               INT32
TAG_BUFFER
```

A v3+ do ApiVersions é uma versão **flexível**, com tipos *compactos*:

- **COMPACT_ARRAY**: o tamanho vem como *unsigned varint* de `N + 1` (`0` = null, `1` = vazio);
- **TAG_BUFFER**: campos opcionais; um varint com a quantidade, que aqui é sempre `0` (um byte `0x00`);
- **unsigned varint**: 7 bits por byte, do menos significativo para o mais; o bit alto diz "continua".

## O que você vai aprender

- os tipos compactos das versões flexíveis do protocolo (KIP-482);
- por que o ApiVersions usa o cabeçalho de resposta **v0** mesmo sendo flexível: o cliente
  ainda não sabe o que o broker suporta quando o lê.

## O que fazer

1. Responda com `error_code = 0` (para versões 0–4).
2. Inclua a entrada `{api_key: 18, min_version: 0, max_version: 4}`.
3. `throttle_time_ms = 0` e os TAG_BUFFERs vazios.

```java
out.writeShort(0);        // error_code
writeUnsignedVarint(2);   // api_keys: 1 entrada + 1
out.writeShort(18);       // ApiVersions
out.writeShort(0);
out.writeShort(4);
out.writeByte(0);         // TAG_BUFFER da entrada
out.writeInt(0);          // throttle_time_ms
out.writeByte(0);         // TAG_BUFFER
```

## Como o tester valida

- faz o parse da resposta inteira e confere que nenhum byte sobra;
- confere `error_code = 0` e a entrada de ApiVersions com 0 ≤ 4 ≤ max.

## Critério de conclusão

O broker responde ApiVersions v4 no formato exato.
