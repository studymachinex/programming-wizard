Implemente o **Fetch v16** para um request sem tópicos.

## O request

```text
max_wait_ms        INT32
min_bytes          INT32
max_bytes          INT32
isolation_level    INT8
session_id         INT32
session_epoch      INT32
topics             COMPACT_ARRAY
  topic_id         UUID
  partitions       COMPACT_ARRAY
    partition              INT32
    current_leader_epoch   INT32
    fetch_offset           INT64
    last_fetched_epoch     INT32
    log_start_offset       INT64
    partition_max_bytes    INT32
    TAG_BUFFER
  TAG_BUFFER
forgotten_topics_data COMPACT_ARRAY (topic_id UUID, partitions COMPACT_ARRAY de INT32, TAG_BUFFER)
rack_id            COMPACT_STRING
TAG_BUFFER
```

## A resposta (cabeçalho v1)

```text
throttle_time_ms   INT32
error_code         INT16
session_id         INT32
responses          COMPACT_ARRAY (stage 15)
TAG_BUFFER
```

## O que fazer

Responda `throttle_time_ms = 0`, `error_code = 0`, `session_id` (o do request) e
`responses` vazio.

## Como o tester valida

- envia um Fetch v16 sem tópicos e confere a resposta até o último byte.

## Critério de conclusão

O broker responde um Fetch vazio.
