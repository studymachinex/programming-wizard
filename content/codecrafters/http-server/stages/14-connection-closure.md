O cliente pode pedir o encerramento da conexão com `Connection: close`. O servidor deve responder e fechar o socket depois de enviar a resposta.

```http
GET / HTTP/1.1
Connection: close
```

Resposta:

```http
HTTP/1.1 200 OK
Connection: close
Content-Length: 0

```

Depois disso, o socket precisa ser fechado. Uma conexão sem `Connection: close` deve continuar aberta e aceitar outro request.

## O que você vai aprender

- o header `Connection`;
- a diferença entre fechar depois da resposta e manter vivo;
- o comportamento padrão de HTTP/1.0 vs. HTTP/1.1.

## O que fazer

1. Faça parsing do header `Connection` (case-insensitive).
2. Se o valor for `close`, adicione `Connection: close` à resposta.
3. Depois de escrever e fazer `flush()`, saia do loop e feche o socket.
4. Caso contrário, mantenha a conexão aberta e continue lendo requests.
5. Para requests HTTP/1.0 sem `Connection: keep-alive`, feche por padrão.

```java
boolean close = "close".equalsIgnoreCase(headers.get("connection"));
// ... escreve resposta com Connection: close ou keep-alive
if (close) break;
```

## Como o tester valida

- envia `GET /` com `Connection: close`;
- verifica status `200` e header `Connection: close`;
- espera o socket fechar;
- abre outra conexão sem `Connection: close`, envia dois requests e verifica que ela continua aberta.

## Cuidados

- Feche o socket **depois** do `flush()`, senão a resposta pode ser cortada.
- Não adicione `Connection: close` em todas as respostas.
- O header pode vir como `Close`, `close` ou com espaços; normalize.
- Em HTTP/1.0, o default é fechar, a menos que o cliente envie `Connection: keep-alive`.

## Critério de conclusão

`Connection: close` fecha a conexão; sem o header, ela permanece aberta.
