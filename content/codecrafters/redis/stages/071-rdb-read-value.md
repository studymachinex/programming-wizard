Os valores também vêm do arquivo.

## O que você vai aprender

- leitura de strings codificadas.

## O que fazer

Guarde chave e valor no keyspace.

## Como o tester valida

- `GET` da chave carregada.

## Dicas

- Formato RDB: cabeçalho `REDIS0011`; seções opcionais `0xFA` (metadado: nome e valor), `0xFE` (seleção de banco), `0xFB` (tamanhos); cada chave: opcional `0xFC` + 8 bytes (expiração em ms, little-endian) ou `0xFD` + 4 bytes (em segundos), o tipo `0x00` (string), a chave e o valor; fim `0xFF` + 8 bytes de checksum. Strings começam pelo tamanho: os 2 bits altos do primeiro byte dizem se ele usa 6 bits, 14 bits ou os 4 bytes seguintes; `0b11` indica um inteiro (1, 2 ou 4 bytes, little-endian).

## Critério de conclusão

Valores do RDB são lidos.
