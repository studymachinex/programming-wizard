A próxima seção é **consumir mensagens** com a API **Fetch** (api_key 1), versão 16.
Anuncie-a.

## O que fazer

Acrescente `{api_key: 1, min_version: 0, max_version: 16}` em `api_keys`.

## Como o tester valida

- confere Fetch (até v16) e DescribeTopicPartitions no ApiVersions.

## Critério de conclusão

ApiVersions lista Fetch v16.
