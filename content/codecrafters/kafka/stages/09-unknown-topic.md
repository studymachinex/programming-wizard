Implemente **DescribeTopicPartitions v0** para um tópico que não existe.

## O request

```text
(cabeçalho de request v2)
topics                       COMPACT_ARRAY
  name                       COMPACT_STRING   (varint N+1 + bytes)
  TAG_BUFFER
response_partition_limit     INT32
cursor                       nullable struct (0xff = null)
TAG_BUFFER
```

## A resposta

Esta API é flexível e usa o **cabeçalho de resposta v1**: `correlation_id` seguido de um
`TAG_BUFFER` (0x00).

```text
correlation_id               INT32
TAG_BUFFER
throttle_time_ms             INT32
topics                       COMPACT_ARRAY
  error_code                 INT16
  name                       COMPACT_NULLABLE_STRING
  topic_id                   UUID (16 bytes)
  is_internal                BOOLEAN
  partitions                 COMPACT_ARRAY (veja o stage 10)
  topic_authorized_operations INT32
  TAG_BUFFER
next_cursor                  nullable struct (0xff = null)
TAG_BUFFER
```

## O que fazer

Para cada tópico pedido (por enquanto, todos são desconhecidos), responda:

- `error_code = 3` (UNKNOWN_TOPIC_OR_PARTITION);
- o nome ecoado;
- `topic_id` com 16 bytes zero;
- `is_internal = false` e `partitions` vazio.

## Como o tester valida

- pede um tópico que não existe e confere todos os campos, até o último byte.

## Dicas

- Esquecer o TAG_BUFFER do cabeçalho v1 desloca a resposta inteira em um byte.

## Critério de conclusão

O broker descreve tópicos inexistentes corretamente.
