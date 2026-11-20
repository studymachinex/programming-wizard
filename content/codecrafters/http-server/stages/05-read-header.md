A rota `GET /user-agent` deve devolver o valor do header `User-Agent` enviado pelo cliente.

```http
GET /user-agent HTTP/1.1
Host: localhost
User-Agent: foobar/1.0
```

Resposta:

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 10

foobar/1.0
```

## O que você vai aprender

- o formato `Nome: valor` dos headers;
- por que nomes de headers são case-insensitive;
- como ler headers até a linha em branco.

## O que fazer

1. Depois da request line, leia linhas até encontrar uma linha vazia (`\r\n`).
2. Divida cada linha no primeiro `:`.
3. Guarde os headers em um `Map` com a chave em minúsculas.
4. Se o path for `/user-agent`, pegue `user-agent` e use o valor como body.
5. Responda com `Content-Type: text/plain` e `Content-Length` correto.
6. Se o header não existir, responda com body vazio ou trate como preferir — o tester sempre envia o header.

```java
Map<String, String> headers = new LinkedHashMap<>();
String line;
while (!(line = reader.readLine()).isEmpty()) {
  int colon = line.indexOf(':');
  headers.put(
      line.substring(0, colon).trim().toLowerCase(Locale.ROOT),
      line.substring(colon + 1).trim()
  );
}
```

## Como o tester valida

Envia `User-Agent: foobar/1.0` e espera body `foobar/1.0` com status `200`.

## Dicas

- Use `toLowerCase(Locale.ROOT)` para evitar problemas com locale.
- Não use `split(":")` sem limite: valores como `Mozilla/5.0 (X11; Linux)` contêm `;`, mas um valor de header pode conter `:` também. Divida apenas no primeiro `:`.
- Remova espaços em branco ao redor do nome e do valor.

## Critério de conclusão

`GET /user-agent` ecoa o `User-Agent` recebido.
