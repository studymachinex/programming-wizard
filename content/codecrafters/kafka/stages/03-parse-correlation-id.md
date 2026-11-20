Responder sempre 7 não serve: o cliente usa o `correlation_id` para casar respostas e
requests. Leia o cabeçalho do request e devolva o valor recebido.

## O cabeçalho de request (v2)

```text
message_size        INT32
request_api_key     INT16    qual API (18 = ApiVersions)
request_api_version INT16    qual versão da API
correlation_id      INT32
client_id           NULLABLE_STRING   INT16 com o tamanho (-1 = null) + bytes
TAG_BUFFER          campos opcionais (veja abaixo)
```

## O que você vai aprender

- a ler um cabeçalho binário campo a campo;
- por que o `correlation_id` existe: um cliente pode ter vários requests em andamento.

## O que fazer

1. Leia `message_size` e então exatamente esse número de bytes.
2. Leia `request_api_key`, `request_api_version` e `correlation_id`.
3. Responda com o `correlation_id` recebido.

```java
DataInputStream in = new DataInputStream(socket.getInputStream());
int size = in.readInt();
byte[] request = in.readNBytes(size);
ByteBuffer buffer = ByteBuffer.wrap(request); // big-endian por padrão
short apiKey = buffer.getShort();
short apiVersion = buffer.getShort();
int correlationId = buffer.getInt();
```

## Como o tester valida

- envia um ApiVersions com `correlation_id` aleatório e confere o eco.

## Critério de conclusão

O broker devolve o `correlation_id` do request.
