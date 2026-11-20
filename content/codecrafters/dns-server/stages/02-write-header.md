Toda mensagem DNS começa com um **header de 12 bytes**. Neste stage, responda com um
header válido em vez de 512 bytes zerados.

## O que você vai aprender

- como um protocolo binário empacota vários campos em poucos bytes;
- a leitura de **bit flags** com deslocamento (`<<`, `>>`) e máscaras (`&`, `|`);
- a ordem de bytes da rede: **big-endian** (byte mais significativo primeiro).

## O formato

```text
 bytes 0-1   ID       identificador da consulta
 bytes 2-3   flags    QR | OPCODE | AA | TC | RD | RA | Z | RCODE
 bytes 4-5   QDCOUNT  quantidade de perguntas
 bytes 6-7   ANCOUNT  quantidade de respostas
 bytes 8-9   NSCOUNT  registros de autoridade
 bytes 10-11 ARCOUNT  registros adicionais
```

Os 16 bits de flags, do mais significativo para o menos:

| Bits | Campo | Significado | Valor neste stage |
|---|---|---|---|
| 1 | QR | 0 = pergunta, 1 = resposta | `1` |
| 4 | OPCODE | tipo de consulta | `0` |
| 1 | AA | resposta autoritativa | `0` |
| 1 | TC | resposta truncada | `0` |
| 1 | RD | recursão desejada | `0` |
| 1 | RA | recursão disponível | `0` |
| 3 | Z | reservado | `0` |
| 4 | RCODE | código de resposta (0 = sem erro) | `0` |

## O que fazer

Responda com um header de 12 bytes contendo:

- `ID = 1234`;
- `QR = 1` e todos os outros bits de flags em `0`;
- todos os contadores em `0` por enquanto.

```java
ByteBuffer header = ByteBuffer.allocate(12); // big-endian por padrão
header.putShort((short) 1234);   // ID
header.putShort((short) 0x8000); // flags: só o QR ligado
header.putShort((short) 0);      // QDCOUNT
header.putShort((short) 0);      // ANCOUNT
header.putShort((short) 0);      // NSCOUNT
header.putShort((short) 0);      // ARCOUNT
byte[] response = header.array();
```

## Como o tester valida

- envia uma consulta com `ID = 1234`;
- confere `ID`, `QR = 1`, `OPCODE = 0`, `AA = 0`, `TC = 0`, `Z = 0` e `RCODE = 0`.

## Dicas

- `java.nio.ByteBuffer` já escreve em big-endian, sem você precisar inverter bytes.
- `0x8000` é `1000 0000 0000 0000` em binário: só o bit mais alto (QR) ligado.
- Mantenha a montagem do header em uma função: ela vai receber parâmetros nos próximos stages.

## Critério de conclusão

A resposta começa com um header DNS válido marcado como resposta.
