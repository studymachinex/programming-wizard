Agora responda o primeiro request. Toda mensagem do Kafka, nos dois sentidos, começa com o
tamanho:

```text
message_size   INT32   tamanho do resto da mensagem, em bytes
<cabeçalho>
<corpo>
```

O cabeçalho de **resposta** (v0) tem um campo só:

```text
correlation_id INT32   identifica a qual request esta resposta pertence
```

## O que você vai aprender

- o enquadramento (*framing*) de mensagens com prefixo de tamanho;
- inteiros **big-endian** (byte mais significativo primeiro), o padrão do Kafka.

## O que fazer

1. Leia o request (por enquanto, pode ignorar o conteúdo).
2. Responda 8 bytes: `message_size` (qualquer valor por enquanto) e `correlation_id = 7`.

```java
DataOutputStream out = new DataOutputStream(socket.getOutputStream());
out.writeInt(0);   // message_size
out.writeInt(7);   // correlation_id
out.flush();
```

## Como o tester valida

- envia um request ApiVersions com `correlation_id = 7`;
- lê os 8 primeiros bytes da resposta e confere o `correlation_id`.

## Critério de conclusão

O broker responde com o `correlation_id` 7.
