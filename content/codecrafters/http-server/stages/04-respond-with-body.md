Implemente a rota `GET /echo/{str}`: ela devolve o trecho `{str}` como body da resposta.

Exemplo:

```http
GET /echo/abc HTTP/1.1
```

Resposta esperada:

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 3

abc
```

## O que você vai aprender

- como extrair um parâmetro do path;
- a diferença entre `Content-Type` e `Content-Length`;
- por que o tamanho precisa ser contado em **bytes**, não em caracteres.

## O que fazer

1. Se o path começar com `/echo/`, extraia tudo depois do prefixo.
2. Monte o body com esse valor.
3. Responda `200 OK`.
4. Inclua `Content-Type: text/plain` e `Content-Length` com o tamanho do body em bytes.
5. Para outros paths, mantenha o comportamento dos stages anteriores.

```java
if (path.startsWith("/echo/")) {
  String value = path.substring("/echo/".length());
  byte[] body = value.getBytes(StandardCharsets.UTF_8);
  // status 200, Content-Type: text/plain, Content-Length: body.length
}
```

## Como o tester valida

- status `200`;
- body exatamente igual a `abc`;
- `Content-Type` começando com `text/plain`;
- `Content-Length: 3`.

## Dicas

- Use `StandardCharsets.UTF_8` explicitamente.
- `String.length()` conta caracteres; `getBytes(...).length` conta bytes. Para acentos e emojis, os valores diferem.
- Não inclua o `/echo/` no body.

## Critério de conclusão

`GET /echo/abc` devolve `abc` com os headers corretos.
