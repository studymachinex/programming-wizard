A última seção é **produzir mensagens** com a API **Produce** (api_key 0), versão 11.
Anuncie-a.

## O que fazer

Acrescente `{api_key: 0, min_version: 0, max_version: 11}` em `api_keys`.

## Como o tester valida

- confere Produce (até v11) e Fetch no ApiVersions.

## Critério de conclusão

ApiVersions lista Produce v11.
