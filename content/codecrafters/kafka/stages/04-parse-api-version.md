O cliente pede uma versão específica de cada API. Se o broker não suporta aquela versão,
responde um código de erro. O seu broker vai suportar **ApiVersions de 0 a 4**.

## O corpo da resposta de ApiVersions

O primeiro campo do corpo é:

```text
error_code INT16   0 = sucesso, 35 = UNSUPPORTED_VERSION
```

## O que você vai aprender

- o versionamento de APIs do Kafka: cada request diz a versão, e o formato muda entre versões;
- os códigos de erro do protocolo.

## O que fazer

1. Se `request_api_version` estiver fora de 0–4, responda `error_code = 35`.
2. Senão, `error_code = 0`.
3. A resposta agora é `message_size`, `correlation_id` e `error_code`. Calcule o
   `message_size` corretamente (tamanho de tudo depois dele).

## Como o tester valida

- envia ApiVersions com uma versão aleatória acima de 4;
- lê os 10 primeiros bytes e confere o `correlation_id` e `error_code = 35`.

## Dicas

- Monte o corpo em um `ByteArrayOutputStream` e só depois escreva `message_size` + bytes.

## Critério de conclusão

Versões não suportadas recebem `UNSUPPORTED_VERSION`.
