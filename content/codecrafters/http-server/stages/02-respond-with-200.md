Agora que o servidor aceita conexões, ele precisa responder a um request HTTP com **status 200**.

## O que você vai aprender

- o formato textual de uma resposta HTTP/1.1;
- status line, headers e a linha em branco que separa headers do body;
- por que `\r\n` (CRLF) importa.

## O que fazer

Leia a request enviada pelo cliente, mesmo que você ainda não use os dados. Depois escreva uma resposta válida:

```text
HTTP/1.1 200 OK\r\n
Content-Length: 0\r\n
\r\n
```

Em Java:

```java
String response =
    "HTTP/1.1 200 OK\r\n" +
    "Content-Length: 0\r\n" +
    "\r\n";

client.getOutputStream().write(response.getBytes(StandardCharsets.UTF_8));
client.getOutputStream().flush();
```

## Como o tester valida

O tester envia algo como:

```http
GET / HTTP/1.1
Host: localhost
```

e verifica se a primeira linha da resposta é `HTTP/1.1 200 OK` (ou outra variação válida com status `200`).

## Dicas

- Use `\r\n`, não apenas `\n`.
- O header `Content-Length` deve refletir o tamanho do body em bytes. Para um body vazio, use `0`.
- Sempre faça `flush()` antes de fechar ou continuar lendo a conexão.

## Critério de conclusão

Uma conexão com `GET / HTTP/1.1` recebe uma resposta com status `200`.
