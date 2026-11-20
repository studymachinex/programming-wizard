Agora combine o stage 6 com o stage 12: **duas conexões persistentes** precisam evoluir ao mesmo tempo, cada uma com sua própria sequência de requests.

O tester faz algo assim:

```text
conn A: GET /echo/a1   conn B: GET /echo/b1
conn A: GET /echo/a2   conn B: GET /echo/b2
conn A: GET /echo/a3   conn B: GET /echo/b3
```

As respostas de A e B podem chegar em qualquer ordem entre conexões, mas cada conexão precisa receber a resposta do seu próprio request.

## O que você vai aprender

- isolamento de estado por conexão;
- concorrência com keep-alive;
- por que não compartilhar buffers entre clientes.

## O que fazer

1. Garanta que cada conexão aceita roda em sua própria thread (stage 6).
2. Dentro de cada thread, mantenha o loop de requests (stage 12).
3. Crie o `BufferedReader`/`InputStream` e o `OutputStream` **dentro** do `handleConnection`, nunca como campos estáticos.
4. Não use um `Map`/`List` compartilhado para a request atual.
5. Feche o socket no fim da conexão.

```java
void handleConnection(Socket client) {
  try (client;
       var input = new BufferedInputStream(client.getInputStream());
       var output = new BufferedOutputStream(client.getOutputStream())) {
    while (true) {
      // parse + route + write
      output.flush();
    }
  }
}
```

## Como o tester valida

- abre duas conexões;
- intercala três requests em cada uma;
- verifica que cada resposta corresponde ao request daquela conexão.

## Dicas

- Se as respostas saírem trocadas, você provavelmente está usando estado compartilhado.
- Se a segunda conexão só começar depois da primeira fechar, o `accept()` loop ainda está bloqueando.
- Virtual threads tornam esse modelo simples: uma thread bloqueada esperando o próximo request não consome CPU.

## Critério de conclusão

Duas conexões persistentes recebem respostas independentes e corretas.
