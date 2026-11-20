Implemente o **Produce v11** para tópicos ou partições que não existem.

## O request

```text
transactional_id   COMPACT_NULLABLE_STRING
acks               INT16
timeout_ms         INT32
topic_data         COMPACT_ARRAY
  name             COMPACT_STRING
  partition_data   COMPACT_ARRAY
    index          INT32
    records        COMPACT_RECORDS
    TAG_BUFFER
  TAG_BUFFER
TAG_BUFFER
```

## A resposta (cabeçalho v1)

```text
responses                 COMPACT_ARRAY
  name                    COMPACT_STRING
  partition_responses     COMPACT_ARRAY
    index                 INT32
    error_code            INT16
    base_offset           INT64
    log_append_time_ms    INT64
    log_start_offset      INT64
    record_errors         COMPACT_ARRAY (vazio)
    error_message         COMPACT_NULLABLE_STRING (null)
    TAG_BUFFER
  TAG_BUFFER
throttle_time_ms          INT32
TAG_BUFFER
```

## O que fazer

Se o tópico não existe no log de metadados, ou a partição não existe nele, responda:
`error_code = 3`, `base_offset = -1`, `log_append_time_ms = -1`, `log_start_offset = -1`.

## Como o tester valida

- envia, no mesmo request, um tópico inexistente e uma partição inexistente de um tópico
  válido; confere os dois.

## Critério de conclusão

Destinos inválidos recebem UNKNOWN_TOPIC_OR_PARTITION.
