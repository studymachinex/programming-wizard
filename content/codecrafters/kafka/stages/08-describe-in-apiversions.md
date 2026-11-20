Na próxima seção você vai implementar a API **DescribeTopicPartitions** (api_key 75),
que descreve tópicos e partições. Antes, anuncie-a no ApiVersions.

## O que fazer

Acrescente a entrada `{api_key: 75, min_version: 0, max_version: 0}` em `api_keys`.

## Como o tester valida

- confere que ApiVersions anuncia a 18 (até v4) e a 75 (v0).

## Critério de conclusão

ApiVersions lista DescribeTopicPartitions.
