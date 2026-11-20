Agora a resposta precisa ser **comprimida de verdade**. O tester envia `Accept-Encoding: gzip`, descomprime o body e compara com o texto original.

```http
GET /echo/compressed HTTP/1.1
Accept-Encoding: gzip
```

- status `200`;
- header `Content-Encoding: gzip`;
- body = bytes gzip de `compressed`;
- `Content-Length` = tamanho do body **comprimido**.

## O que você vai aprender

- o formato gzip;
- compressão em memória com `GZIPOutputStream`;
- por que `Content-Length` muda depois de comprimir.

## O que fazer

1. Monte o body normalmente.
2. Se gzip for aceitável e houver body, comprima os bytes:

   ```java
   ByteArrayOutputStream buffer = new ByteArrayOutputStream();
   try (GZIPOutputStream gzip = new GZIPOutputStream(buffer)) {
     gzip.write(body);
   }
   byte[] compressed = buffer.toByteArray();
   ```

3. Envie `Content-Encoding: gzip`.
4. Use `compressed.length` em `Content-Length`.
5. Envie os bytes comprimidos, não a string original.

## Como o tester valida

- header `Content-Encoding: gzip`;
- `gunzip` do body resulta em `compressed`;
- `Content-Length` é igual ao número de bytes comprimidos.

## Dicas

- Não comprima respostas sem body (ex.: `404` com body vazio).
- Não use `String` para o body comprimido: ele contém bytes arbitrários.
- Feche o `GZIPOutputStream` antes de chamar `toByteArray()`; o `finish()` é o que escreve o trailer gzip.
- Mantenha a negociação do stage 10: só comprima se o cliente aceitar gzip.

## Critério de conclusão

O body gzip descomprime corretamente e o `Content-Length` corresponde ao tamanho comprimido.
