O Fetch identifica tópicos pelo **topic_id** (UUID), não pelo nome. Trate um id que não
existe.

## A resposta por tópico e partição

```text
responses                COMPACT_ARRAY
  topic_id               UUID
  partitions             COMPACT_ARRAY
    partition_index      INT32
    error_code           INT16
    high_watermark       INT64
    last_stable_offset   INT64
    log_start_offset     INT64
    aborted_transactions COMPACT_ARRAY (vazio)
    preferred_read_replica INT32 (-1)
    records              COMPACT_RECORDS (varint N+1 + bytes; 0 = null)
    TAG_BUFFER
  TAG_BUFFER
```

## O que fazer

Para um `topic_id` que não está no log de metadados, responda uma partição para cada uma
pedida com `error_code = 100` (UNKNOWN_TOPIC_ID).

## Como o tester valida

- pede um `topic_id` aleatório e confere o eco do id e o `error_code = 100`.

## Dicas

- Mantenha também um mapa `topic_id → tópico` além do mapa por nome.

## Critério de conclusão

`topic_id` desconhecido recebe UNKNOWN_TOPIC_ID.
