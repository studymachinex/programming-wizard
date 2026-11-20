A resposta agora depende do **path** da request. `GET /` deve retornar `200`, e qualquer outro path deve retornar `404 Not Found`.

## O que você vai aprender

- como ler a request line;
- como separar método, target e versão;
- roteamento simples baseado em path.

## O que fazer

1. Leia a primeira linha da request, por exemplo:

   ```text
   GET /abc HTTP/1.1
   ```

2. Separe a linha por espaços. O segundo token é o target.
3. Se o path for exatamente `/`, responda `200 OK`.
4. Caso contrário, responda `404 Not Found`.
5. Nos dois casos, envie uma resposta HTTP válida.

```java
String requestLine = reader.readLine();
String path = requestLine.split(" ")[1];

if (path.equals("/")) {
  writeResponse(client, 200, "OK");
} else {
  writeResponse(client, 404, "Not Found");
}
```

## Como o tester valida

- `GET /` → status `200`;
- `GET /abc` → status `404`.

## Cuidados

- O target pode conter query string (`/echo/abc?x=1`). Neste desafio, considere apenas a parte antes do `?`.
- Não compare a request line inteira: método e versão podem variar.
- O body da resposta pode ser vazio, mas a resposta precisa ter status line e a linha em branco final.

## Critério de conclusão

`/` responde `200` e um path desconhecido responde `404`.
