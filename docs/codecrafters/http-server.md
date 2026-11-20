# HTTP Server — guia e implementação de referência

**Status:** ✅ 14/14 stages concluídos e verificados localmente.

- Implementação: [`challenges/http-server/java`](../../challenges/http-server/java)
- Tester: [`challenges/http-server/tests/run-stages.mjs`](../../challenges/http-server/tests/run-stages.mjs)
- Desafio original: <https://app.codecrafters.io/courses/http-server/overview>

## Como rodar

```bash
# compila + executa os 14 stages
node challenges/http-server/tests/run-stages.mjs

# rodar só os testes, sem recompilar
node challenges/http-server/tests/run-stages.mjs --no-build

# subir o servidor manualmente (porta 4221)
cd challenges/http-server/java
mvn -q -B package
java -jar target/http-server.jar --directory C:\tmp\data
```

No Windows também existe `your_program.cmd`; no Unix, `your_program.sh`.

### Exemplos com curl

```bash
curl -i http://localhost:4221/
curl -i http://localhost:4221/echo/abc
curl -i -H "User-Agent: wizard/1.0" http://localhost:4221/user-agent
curl -i --compressed http://localhost:4221/echo/hello
curl -i http://localhost:4221/files/hello.txt
curl -i -X POST --data-binary "conteudo" http://localhost:4221/files/new.txt
```

## Stages

| # | Stage | O que a implementação faz |
|---:|---|---|
| 1 | Bind to a port | `ServerSocket` em `0.0.0.0:4221`, `SO_REUSEADDR`, `accept()` em loop. |
| 2 | Respond with 200 | Escreve status line `HTTP/1.1 200 OK` + headers + CRLF. |
| 3 | Extract URL path | Roteia `/` → 200 e qualquer path desconhecido → 404. |
| 4 | Respond with body | `GET /echo/{str}` devolve o texto com `Content-Type: text/plain` e `Content-Length`. |
| 5 | Read header | `GET /user-agent` devolve o header `User-Agent` da request. |
| 6 | Concurrent connections | Uma virtual thread por conexão (`newVirtualThreadPerTaskExecutor`). |
| 7 | Return a file | `--directory <pasta>` define a raiz; `GET /files/{nome}` lê o arquivo ou 404. |
| 8 | Read request body | `POST /files/{nome}` grava o body no diretório e responde 201. |
| 9 | Compression headers | Se `Accept-Encoding` aceita gzip, adiciona `Content-Encoding: gzip`. |
| 10 | Multiple compression schemes | Faz parsing de lista e `q=`; ignora schemes desconhecidos; `q=0` recusa. |
| 11 | Gzip compression | Comprime o body com `GZIPOutputStream` e ajusta o `Content-Length`. |
| 12 | Persistent connections | Loop de requests na mesma conexão; HTTP/1.1 mantém aberta por padrão. |
| 13 | Concurrent persistent connections | Cada conexão persistente tem sua própria thread; várias ao mesmo tempo. |
| 14 | Connection closure | `Connection: close` responde e fecha; HTTP/1.0 fecha por padrão. |

## Arquitetura do código

`src/main/java/Main.java`:

| Área | Responsabilidade |
|---|---|
| `main` | Lê `--directory`/`--port`, abre o `ServerSocket` e dispara uma virtual thread por cliente. |
| `handleConnection` | Loop de request/response; decide keep-alive vs close; trata timeout e erros. |
| `readRequest` | Parse da request line, headers (case-insensitive), `Content-Length` e `Transfer-Encoding: chunked`. |
| `readChunkedBody` | Decoder de chunked body (não é exigido nos stages, mas deixa o servidor robusto). |
| `route` | Rotas `/`, `/echo/`, `/user-agent`, `/files/` (GET/HEAD/POST) e 404/405. |
| `resolveInsideBase` | Normaliza o caminho e bloqueia path traversal para fora do `--directory`. |
| `writeResponse` | Monta status line/headers, aplica gzip e escreve o body; respeita `HEAD`. |
| `acceptsGzip` | Parser de `Accept-Encoding` com suporte a `gzip`, `x-gzip`, `*` e `q=`. |
| `Request` / `Response` | Records internos para carregar dados entre parser, roteador e writer. |

### Decisões que valem anotar

- **Virtual threads** em vez de thread pool fixo: o custo por conexão é baixo e o código
  fica simples; é o mesmo modelo que Java 21 incentiva para servidores I/O-bound.
- **Leitura linha a linha com limite** (`MAX_START_LINE`, `MAX_HEADER_LINE`, `MAX_HEADERS`)
  evita consumir memória sem limite com requests malformadas.
- **Persistência**: HTTP/1.1 mantém a conexão por padrão; `Connection: close` encerra.
  HTTP/1.0 só mantém se o cliente pedir `keep-alive`.
- **Gzip** é aplicado somente quando há body, status 200 e o cliente aceita; o
  `Content-Length` é recalculado com o tamanho comprimido.
- **Segurança de arquivos**: `baseDirectory.resolve(nome).normalize()` + `startsWith`
  impede `/files/../../etc/passwd`.
- **Body**: suporta `Content-Length` e chunked; limita a 10 MB para evitar abuso.

## Tester local

O tester é o protótipo do runner da plataforma:

1. compila com Maven;
2. cria um diretório temporário;
3. sobe o servidor na porta 4221 (ou 43210 se estiver ocupada);
4. abre conexões TCP cruas e valida status, headers, body e fechamento;
5. imprime `✅`/`❌` por stage e retorna código de saída 1 em caso de falha.

Cobertura por stage:

| Stage | Verificação |
|---:|---|
| 1 | conexão TCP é aceita |
| 2 | status 200 |
| 3 | `/` = 200 e `/abc` = 404 |
| 4 | body, `Content-Type` e `Content-Length` do echo |
| 5 | eco do `User-Agent` |
| 6 | duas conexões simultâneas recebem resposta |
| 7 | leitura de arquivo existente e 404 para inexistente |
| 8 | POST grava no disco e GET devolve o conteúdo |
| 9 | header `Content-Encoding: gzip` |
| 10 | scheme não suportado, lista com gzip e `q=0` |
| 11 | body descomprime corretamente e `Content-Length` é o comprimido |
| 12 | três requests sequenciais na mesma conexão |
| 13 | duas conexões persistentes intercaladas |
| 14 | `Connection: close` fecha; conexão padrão continua aberta |

## Integração com a plataforma

O desafio agora está jogável de ponta a ponta:

- starter repo em [`challenges/http-server/starter/java`](../../challenges/http-server/starter/java);
- instruções dos 14 stages em
  [`content/codecrafters/http-server/stages`](../../content/codecrafters/http-server/stages);
- runner reutilizável em [`tests/stages.mjs`](tests/stages.mjs);
- CLI/engine em [`challenges/engine`](../../challenges/engine), com remote git local e
  hook `post-receive` que roda os testes no push;
- página em `/projetos/codecrafters/http-server`, com sidebar de stages, instruções,
  botões de testar/submeter e progresso.

Fluxo:

```bash
npm run cc -- start http-server
npm run cc -- task
npm run cc -- test
npm run cc -- submit
```

O progresso é gravado em `challenges/.workspaces/.state/http-server.json`.

### O que ainda falta

- runner isolado (container) com timeout, limite de memória e portas temporárias;
- starter repos para outras linguagens (Go, Python, Rust...);
- persistência do progresso no PostgreSQL (hoje é JSON local);
- desafios restantes do catálogo.

