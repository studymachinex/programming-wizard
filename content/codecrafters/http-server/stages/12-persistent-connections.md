Por padrão, HTTP/1.1 mantém a conexão aberta depois de uma resposta. O servidor precisa ler **vários requests na mesma conexão**, em sequência.

```http
GET /echo/first HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Connection: keep-alive
Content-Length: 5

first
```

Depois, sem fechar o socket, o cliente envia `GET /echo/second` e espera outra resposta.

## O que você vai aprender

- conexões persistentes (keep-alive);
- o papel do header `Connection`;
- o loop request → response dentro do `handleConnection`.

## O que fazer

1. Depois de escrever uma resposta, **não feche o socket** automaticamente.
2. Volte a ler a próxima request line no mesmo `InputStream`.
3. Repita o ciclo até o cliente fechar a conexão ou pedir `Connection: close`.
4. Inclua `Connection: keep-alive` nas respostas HTTP/1.1.
5. Faça `flush()` depois de cada resposta.

```java
while (true) {
  String requestLine = reader.readLine();
  if (requestLine == null || requestLine.isEmpty()) break;
  // parse headers, roteia, responde...
}
```

## Como o tester valida

Envia três requests sequenciais na mesma conexão (`first`, `second`, `third`), lê três respostas e verifica:
- body correto em cada uma;
- header `Connection: keep-alive` presente.

## Cuidados

- Se você usar `BufferedReader`, ele pode bloquear esperando mais dados. Leia linha a linha e pare no `\r\n\r\n`.
- Não recrie o socket nem o reader a cada request.
- `Connection: close` será tratado no stage 14; por enquanto, mantenha aberto.
- O servidor não deve ficar preso em um request incompleto para sempre. Um timeout de socket ajuda.

## Critério de conclusão

Três requests na mesma conexão recebem três respostas corretas.
