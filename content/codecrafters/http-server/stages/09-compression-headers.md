Quando o cliente envia `Accept-Encoding: gzip`, a resposta pode ser comprimida. Neste stage, o foco é **negociar o header**: se o cliente aceita gzip, inclua `Content-Encoding: gzip` na resposta.

```http
GET /echo/abc HTTP/1.1
Accept-Encoding: gzip
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Encoding: gzip
Content-Length: 3

abc
```

> Neste stage o body ainda pode ir sem compressão. O stage 11 vai exigir os bytes comprimidos de verdade. Aqui o tester valida apenas o header.

## O que você vai aprender

- negociação de conteúdo;
- `Accept-Encoding` vs. `Content-Encoding`;
- por que o header da resposta só pode aparecer se o cliente pediu.

## O que fazer

1. Ao montar a resposta, verifique se o request tem `Accept-Encoding`.
2. Se o valor contiver `gzip`, adicione `Content-Encoding: gzip` aos headers da resposta.
3. Mantenha o body e o `Content-Length` atuais neste stage.
4. Se o cliente não pediu gzip, não envie `Content-Encoding`.

## Como o tester valida

- `GET /echo/abc` com `Accept-Encoding: gzip` → header `Content-Encoding: gzip` presente.

## Dicas

- O valor pode ser `gzip`, `br, gzip`, `gzip;q=0.8` etc. O stage 10 vai aprofundar o parsing.
- Não confunda com `Content-Type`.
- `Content-Encoding` descreve a codificação do body; `Content-Length` deve ser o tamanho do body **enviado** (nesse stage, ainda sem compressão).

## Critério de conclusão

O header `Content-Encoding: gzip` aparece somente quando o cliente aceita gzip.
