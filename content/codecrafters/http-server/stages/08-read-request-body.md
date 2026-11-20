Implemente `POST /files/{nome}`: grave o body da request no arquivo indicado e responda `201 Created`.

```http
POST /files/new-file.txt HTTP/1.1
Host: localhost
Content-Type: application/octet-stream
Content-Length: 14

body from POST
```

Depois, `GET /files/new-file.txt` deve devolver exatamente `body from POST`.

## O que você vai aprender

- `Content-Length` e leitura exata de bytes;
- a diferença entre `Reader` e `InputStream`;
- escrita de arquivos com `Files.write`.

## O que fazer

1. Leia os headers e obtenha `Content-Length`.
2. Leia exatamente N bytes do socket. Não use `readLine()` para o body: ele pode conter `\n`, `\r` ou bytes binários.
3. Escreva os bytes em `base.resolve(nome)`, validando que o caminho está dentro do diretório.
4. Responda `201 Created` com `Content-Length: 0`.
5. Mantenha o `GET /files/...` funcionando.

```java
int length = Integer.parseInt(headers.getOrDefault("content-length", "0"));
byte[] body = inputStream.readNBytes(length);
Files.write(target, body, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
```

## Como o tester valida

- envia o POST;
- espera status `201`;
- lê o arquivo do disco e compara com o body;
- faz GET e compara o conteúdo devolvido.

## Cuidados

- `InputStream.readNBytes(n)` pode retornar menos bytes se a conexão fechar. Verifique o tamanho.
- Se você usa `BufferedReader` para os headers, ele pode ter lido parte do body no buffer. O ideal é ler o socket com um `BufferedInputStream` e fazer o parsing de linhas você mesmo, ou usar `readNBytes` do mesmo stream.
- Não responda antes de gravar o arquivo.
- Para o stage 8, não é necessário suportar `Transfer-Encoding: chunked`.

## Critério de conclusão

O arquivo é gravado no diretório e o `GET` seguinte devolve o conteúdo.
