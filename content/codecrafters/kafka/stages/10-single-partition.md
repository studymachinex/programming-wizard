Agora tópicos que existem. No Kafka com KRaft, tópicos e partições são registrados em um
**log de metadados**:

```text
<log.dirs>/__cluster_metadata-0/00000000000000000000.log
```

## O formato do log

O arquivo é uma sequência de **record batches**:

```text
baseOffset            INT64
batchLength           INT32   bytes depois deste campo
partitionLeaderEpoch  INT32
magic                 INT8    (2)
crc                   UINT32
attributes            INT16
lastOffsetDelta       INT32
baseTimestamp         INT64
maxTimestamp          INT64
producerId            INT64
producerEpoch         INT16
baseSequence          INT32
recordsCount          INT32
records               recordsCount × record
```

Cada **record**: `length` (varint), `attributes` (INT8), `timestampDelta` (varlong),
`offsetDelta` (varint), `keyLength` (varint, -1 = null), `key`, `valueLength` (varint),
`value`, `headersCount` (varint). Esses varints são **com sinal** (*zigzag*).

O `value` de cada record é um registro de metadados:

```text
frame_version INT8 (1) | type INT8 | version INT8 | campos...
```

| type | Registro | Campos que interessam |
|---:|---|---|
| 2 | TopicRecord | `name` (COMPACT_STRING), `topic_id` (UUID) |
| 3 | PartitionRecord (v1) | `partition_id` (INT32), `topic_id` (UUID), `replicas`, `isr`, `removing_replicas`, `adding_replicas` (COMPACT_ARRAY de INT32), `leader` (INT32), `leader_epoch` (INT32) |
| 12 | FeatureLevelRecord | (pode ignorar) |

## A partição na resposta

```text
error_code                INT16
partition_index           INT32
leader_id                 INT32
leader_epoch              INT32
replica_nodes             COMPACT_ARRAY de INT32
isr_nodes                 COMPACT_ARRAY de INT32
eligible_leader_replicas  COMPACT_ARRAY de INT32 (vazio)
last_known_elr            COMPACT_ARRAY de INT32 (vazio)
offline_replicas          COMPACT_ARRAY de INT32 (vazio)
TAG_BUFFER
```

## O que fazer

1. Na inicialização, leia o log de metadados e monte um mapa nome → tópico (id e partições).
2. Para um tópico conhecido: `error_code = 0`, o `topic_id` do TopicRecord e as partições.

## Como o tester valida

- gera um log de metadados com dois tópicos;
- pede um tópico com uma partição e confere `topic_id`, `partition_index`, `leader_id`,
  `replica_nodes` e `isr_nodes`.

## Dicas

- `java.util.UUID` lê os 16 bytes como dois `long` big-endian.
- Um PartitionRecord só tem o `topic_id`: associe ao tópico depois de ler o log inteiro.

## Critério de conclusão

O broker descreve tópicos a partir do log de metadados.
