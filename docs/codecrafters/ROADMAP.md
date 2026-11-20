# CodeCrafters no Programming Wizard

> Roadmap vivo dos desafios "Build your own X" do [CodeCrafters](https://app.codecrafters.io/catalog).
> Atualize os checkboxes conforme cada stage for concluído.

**Status geral:** **144/425 stages (34%)** · 9 desafios concluídos · 1 em andamento · HTTP Server, Git, DNS Server, Tokenizer, SQLite, Claude Code, BitTorrent, Kafka e grep jogáveis na plataforma.

**Integração na plataforma:** do desafio com menos stages para o com mais —
Git (7) ✅ → DNS Server (8) ✅ → Tokenizer (8) ✅ → SQLite (9) ✅ → Claude Code (18) ✅ → BitTorrent (19) ✅
→ Kafka (25) ✅ → grep (33) ✅ → Shell (76) → Interpreter (84) → Redis (124).

| # | Desafio | Stages | Progresso | Status | Acesso | Onde está |
|---:|---|---:|---:|---|---|---|
| 1 | [HTTP Server](https://app.codecrafters.io/courses/http-server/overview) | 14 | 14/14 | ✅ concluído | membros | [`challenges/http-server`](../../challenges/http-server) |
| 2 | [Redis](https://app.codecrafters.io/courses/redis/overview) | 124 | 3/124 | 🟡 em andamento | grátis até 31/12/2026 | clone local `codecrafters-redis-java` |
| 3 | [Git](https://app.codecrafters.io/courses/git/overview) | 7 | 7/7 | ✅ concluído | membros | [`challenges/git`](../../challenges/git) |
| 4 | [DNS Server](https://app.codecrafters.io/courses/dns-server/overview) | 8 | 8/8 | ✅ concluído | membros | [`challenges/dns-server`](../../challenges/dns-server) |
| 5 | [SQLite](https://app.codecrafters.io/courses/sqlite/overview) | 9 | 9/9 | ✅ concluído | membros | [`challenges/sqlite`](../../challenges/sqlite) |
| 6 | [Tokenizer](https://app.codecrafters.io/courses/tokenizer/overview) | 8 | 8/8 | ✅ concluído | early access | [`challenges/tokenizer`](../../challenges/tokenizer) |
| 7 | [BitTorrent](https://app.codecrafters.io/courses/bittorrent/overview) | 19 | 19/19 | ✅ concluído | membros | [`challenges/bittorrent`](../../challenges/bittorrent) |
| 8 | [Kafka](https://app.codecrafters.io/courses/kafka/overview) | 25 | 25/25 | ✅ concluído | membros | [`challenges/kafka`](../../challenges/kafka) |
| 9 | [grep](https://app.codecrafters.io/courses/grep/overview) | 33 | 33/33 | ✅ concluído | membros | [`challenges/grep`](../../challenges/grep) |
| 10 | [Shell](https://app.codecrafters.io/courses/shell/overview) | 76 | 0/76 | ⬜ não iniciado | membros | — |
| 11 | [Interpreter](https://app.codecrafters.io/courses/interpreter/overview) | 84 | 0/84 | ⬜ não iniciado | membros | — |
| 12 | [Claude Code](https://app.codecrafters.io/courses/claude-code/overview) | 18 | 18/18 | ✅ concluído | beta | [`challenges/claude-code`](../../challenges/claude-code) |

> **Total:** 425 stages. O catálogo público completo, com todos os stages e IDs, está em
> [`content/codecrafters/catalog.json`](../../content/codecrafters/catalog.json).
> Para ressincronizar: `node scripts/sync-codecrafters-catalog.mjs`.

## Como o modelo CodeCrafters funciona

1. **Catálogo** de desafios "Build your own X" (Redis, HTTP Server, Git, Kafka...).
2. **Starter repo por linguagem**: a pessoa clona, roda `your_program.sh` e implementa no arquivo indicado.
3. **Stages sequenciais**: cada stage tem instruções, exemplos de código, conceitos, dicas e fórum.
4. **Test runner**: ao dar `git push`, o CodeCrafters compila e roda testes de integração contra o programa; o resultado aparece no terminal.
5. **Progresso**: cada stage fica `In-progress`/`Passed`, com histórico e badge no README.

O que vamos replicar na plataforma:

- catálogo + página de desafio;
- instruções por stage em markdown;
- starter repo por linguagem;
- runner de testes isolado (sem depender do serviço externo);
- progresso por stage (JSON local nesta versão; PostgreSQL no roadmap);
- comando/hook de submissão (`wizard submit` ou git hook).

**Já implementado para HTTP Server, Git, DNS Server, Tokenizer, SQLite, Claude Code, BitTorrent, Kafka e grep:** catálogo, página, instruções, starter Java,
runner, CLI `npm run cc -- ...`, remote local `wizard` e hook `post-receive`.

## Ordem recomendada

A ordem abaixo vai do menor para o maior esforço e introduz uma habilidade nova por desafio.

| Fase | Desafios | Por quê |
|---|---|---|
| 1 | **HTTP Server** ✅ | TCP + HTTP textual; base para tudo que usa rede. |
| 2 | **Redis** (core 1–7) → **Git** → **DNS** | RESP, hashing/objetos binários e protocolo binário em UDP. |
| 3 | **SQLite** → **BitTorrent** → **Kafka** | Formato de arquivo, protocolo peer-to-peer e protocolo binário com concorrência. |
| 4 | **grep** → **Shell** → **Interpreter** | Regex, processos/pipes e lexer/parser/evaluator. |
| 5 | **Redis** (8–124) → **Claude Code** → **Tokenizer** | Persistência/replicação, tool calling/agentes e BPE. |

> Redis já está em andamento (3/124). A sugestão é fechar o core (stages 1–7) antes de
> começar Git e DNS, e depois voltar para as seções avançadas em uma segunda passada.

---

## Fichas por desafio

### ✅ HTTP Server — 14/14

**Foco:** TCP, HTTP/1.1, parsing de request, rotas, arquivos, gzip e conexões persistentes.

**Implementação:** [`challenges/http-server/java`](../../challenges/http-server/java) ·
**Guia detalhado:** [`http-server.md`](http-server.md)

**Stages:**

- [x] 1. Bind to a port
- [x] 2. Respond with 200
- [x] 3. Extract URL path
- [x] 4. Respond with body
- [x] 5. Read header
- [x] 6. Concurrent connections
- [x] 7. Return a file
- [x] 8. Read request body
- [x] 9. Compression headers
- [x] 10. Multiple compression schemes
- [x] 11. Gzip compression
- [x] 12. Persistent connections
- [x] 13. Concurrent persistent connections
- [x] 14. Connection closure

**O que falta:** runner isolado em container, starters para outras linguagens e
persistência do progresso no PostgreSQL. A experiência principal (starter, instruções,
CLI, remote git, hook e página em `/projetos/codecrafters/http-server`) está pronta.

---

### 🟡 Redis — 3/124

**Foco:** protocolo RESP, servidor TCP concorrente, estruturas de dados, expiração,
transações, replicação, RDB/AOF, pub/sub, sorted sets, bitmaps, geo e autenticação.

**Implementação:** clone externo em `../codecrafters-redis-java` (não versionado
neste repositório).
**Guia detalhado:** [`redis.md`](redis.md)

**Core (1–7):**

- [x] 1. Bind to a port
- [x] 2. Respond to PING
- [x] 3. Respond to multiple PINGs (#wy1)
- [ ] 4. Handle concurrent clients
- [ ] 5. Implement the ECHO command
- [ ] 6. Implement the SET & GET commands
- [ ] 7. Expiry

**Seções restantes:**

| Seção | Stages | Cobre | Status |
|---|---:|---|---|
| Lists | 11 | RPUSH, LRANGE, LPUSH, LLEN, LPOP, BLPOP | ⬜ |
| Streams | 13 | XADD, XRANGE, XREAD, IDs, blocking reads | ⬜ |
| Transactions | 11 | INCR, MULTI, EXEC, DISCARD, erros | ⬜ |
| Optimistic Locking | 8 | WATCH, UNWATCH, modificações | ⬜ |
| Replication | 18 | INFO, handshake, propagação, ACK, WAIT | ⬜ |
| RDB Persistence | 6 | parsing de RDB, strings, expiração | ⬜ |
| AOF Persistence | 10 | append-only file, manifest, replay | ⬜ |
| Pub/Sub | 7 | SUBSCRIBE, PUBLISH, modo inscrito | ⬜ |
| Sorted Sets | 8 | ZADD, ZRANGE, ranks, scores | ⬜ |
| Bitmaps | 9 | SETBIT, GETBIT, BITCOUNT, AND/OR | ⬜ |
| Geospatial | 8 | GEOADD, GEOPOS, distância, raio | ⬜ |
| Authentication | 8 | ACL, AUTH, senha default | ⬜ |

**O que falta:** implementar os 121 stages restantes; o próximo é
**#zu2 — Handle concurrent clients** (thread por cliente ou event loop). O clone já
responde múltiplos PINGs na mesma conexão e aceita RESP e comandos inline.

---

### ✅ Git — 7/7

**Foco:** formato `.git`, SHA-1, zlib, objetos blob/tree/commit, protocolo smart HTTP,
packfiles e deltas.

**Implementação:** [`challenges/git/java`](../../challenges/git/java) ·
**Tester:** [`challenges/git/tests/run-stages.mjs`](../../challenges/git/tests/run-stages.mjs)

- [x] 1. Initialize the `.git` directory
- [x] 2. Read a blob object
- [x] 3. Create a blob object
- [x] 4. Read a tree object
- [x] 5. Write a tree object
- [x] 6. Create a commit
- [x] 7. Clone a repository

**Como o tester funciona:** cada stage roda o programa em uma pasta temporária e usa o
git real como oráculo (SHAs, `cat-file`, `ls-tree`, `log`). O clone sobe um servidor
smart HTTP local com `git http-backend`, servindo um repositório de 5 commits
compactado com deltas — não precisa de internet.

**O que falta:** index (`.git/index`) e starters para outras linguagens.

---

### ✅ DNS Server — 8/8

**Foco:** UDP, header DNS, flags em bits, QNAME, answer records, compressão de nomes e
forwarding.

**Implementação:** [`challenges/dns-server/java`](../../challenges/dns-server/java) ·
**Tester:** [`challenges/dns-server/tests/run-stages.mjs`](../../challenges/dns-server/tests/run-stages.mjs)

- [x] 1. Setup UDP server
- [x] 2. Write header section
- [x] 3. Write question section
- [x] 4. Write answer section
- [x] 5. Parse header section
- [x] 6. Parse question section
- [x] 7. Parse compressed packet
- [x] 8. Forwarding Server

**Como o tester funciona:** sobe um resolver DNS falso em UDP e inicia o servidor com
`--resolver 127.0.0.1:<porta>`. Os stages 2–7 conferem só a estrutura (IP fixo ou
encaminhado passam igual); o stage 8 exige o IP do resolver, que só aceita uma pergunta
por pacote.

**O que falta:** tipos além de A (AAAA, CNAME, MX) e starters para outras linguagens.

---

### ✅ SQLite — 9/9

**Foco:** formato de arquivo, páginas, B-trees de tabela e de índice, varints, formato de
registro, schema, SELECT/WHERE, full table scan e busca por índice.

**Implementação:** [`challenges/sqlite/java`](../../challenges/sqlite/java) ·
**Tester:** [`challenges/sqlite/tests/run-stages.mjs`](../../challenges/sqlite/tests/run-stages.mjs)

- [x] 1. Print page size
- [x] 2. Print number of tables
- [x] 3. Print table names
- [x] 4. Count rows in a table
- [x] 5. Read data from a single column
- [x] 6. Read data from multiple columns
- [x] 7. Filter data with a WHERE clause
- [x] 8. Retrieve data using a full-table scan
- [x] 9. Retrieve data using an index

**Como o tester funciona:** gera bancos aleatórios com o SQLite embutido no Node
(`node:sqlite`, Node 22.13+) e compara com o resultado do próprio SQLite. No stage 9,
zera as páginas folha da tabela que não têm linhas do resultado: só uma busca pelo
índice seguida de busca por rowid consegue responder.

**O que falta:** overflow pages, outros operadores no WHERE e starters para outras
linguagens.

---

### ✅ Tokenizer — 8/8

**Foco:** UTF-8, byte pair encoding (contagem de pares, merges, treino), encode/decode,
pré-tokenização com regex Unicode e compatibilidade com o GPT-2.

**Implementação:** [`challenges/tokenizer/java`](../../challenges/tokenizer/java) ·
**Tester:** [`challenges/tokenizer/tests/run-stages.mjs`](../../challenges/tokenizer/tests/run-stages.mjs)

- [x] 1. UTF-8 bytes
- [x] 2. Most frequent pair
- [x] 3. Merge a pair
- [x] 4. Learn merges
- [x] 5. Encode
- [x] 6. Decode
- [x] 7. Split like GPT-2
- [x] 8. Match GPT-2

**Como o tester funciona:** cada comando recebe a entrada pelo stdin e a saída é
comparada com uma implementação de referência em JavaScript dentro do tester. O stage 8
usa o `vocab.bpe` original do GPT-2, versionado em
[`challenges/tokenizer/data/gpt2`](../../challenges/tokenizer/data/gpt2) (licença MIT da
OpenAI), e confere a âncora conhecida `Hello world` → `15496 995`.

**O que falta:** tokens especiais (`<|endoftext|>`), o padrão de split do GPT-4
(`cl100k_base`) e starters para outras linguagens.

---

### ✅ BitTorrent — 19/19

**Foco:** bencode, arquivos .torrent, info hash, tracker HTTP, protocolo peer wire,
download de peças com verificação de hash e magnet links com a extensão de metadados
(BEP 9/10).

**Implementação:** [`challenges/bittorrent/java`](../../challenges/bittorrent/java) ·
**Tester:** [`challenges/bittorrent/tests/run-stages.mjs`](../../challenges/bittorrent/tests/run-stages.mjs)

**Core:**

- [x] 1. Decode bencoded strings
- [x] 2. Decode bencoded integers
- [x] 3. Decode bencoded lists
- [x] 4. Decode bencoded dictionaries
- [x] 5. Parse torrent file
- [x] 6. Calculate info hash
- [x] 7. Piece hashes
- [x] 8. Discover peers
- [x] 9. Peer handshake
- [x] 10. Download a piece
- [x] 11. Download the whole file

**Magnet Links:**

- [x] 12. Parse magnet link
- [x] 13. Announce extension support
- [x] 14. Send extension handshake
- [x] 15. Receive extension handshake
- [x] 16. Request metadata
- [x] 17. Receive metadata
- [x] 18. Download a piece
- [x] 19. Download the whole file

**Como o tester funciona:** gera arquivos e torrents aleatórios e sobe um tracker HTTP e
peers TCP em 127.0.0.1. Os peers validam o protocolo (handshake, request antes do
unchoke, blocos de até 16 KiB, ids de extensão) e explicam o erro quando algo sai do
padrão. Nada sai da máquina.

**O que falta:** download paralelo de vários peers, *rarest first*, torrents com vários
arquivos e starters para outras linguagens.

---

### ✅ Kafka — 25/25

**Foco:** protocolo binário do Kafka (framing, cabeçalhos v0/v1/v2, tipos compactos e
tagged fields), concorrência, ApiVersions, DescribeTopicPartitions a partir do log de
metadados KRaft, Fetch de record batches do disco e Produce com atribuição de offsets.

**Implementação:** [`challenges/kafka/java`](../../challenges/kafka/java) ·
**Tester:** [`challenges/kafka/tests/run-stages.mjs`](../../challenges/kafka/tests/run-stages.mjs)

**Core:**

- [x] 1. Bind to a port
- [x] 2. Send Correlation ID
- [x] 3. Parse Correlation ID
- [x] 4. Parse API Version
- [x] 5. Handle ApiVersions requests

**Concurrent Clients:**

- [x] 6. Serial requests
- [x] 7. Concurrent requests

**Listing Partitions:**

- [x] 8. Include DescribeTopicPartitions in ApiVersions
- [x] 9. List for an unknown topic
- [x] 10. List for a single partition
- [x] 11. List for multiple partitions
- [x] 12. List for multiple topics

**Consuming Messages:**

- [x] 13. Include Fetch in ApiVersions
- [x] 14. Fetch with no topics
- [x] 15. Fetch with an unknown topic
- [x] 16. Fetch with an empty topic
- [x] 17. Fetch single message from disk
- [x] 18. Fetch multiple messages from disk

**Producing Messages:**

- [x] 19. Include Produce in ApiVersions
- [x] 20. Respond for invalid topic or partition
- [x] 21. Respond for valid topic and partition
- [x] 22. Produce a single record
- [x] 23. Produce multiple records
- [x] 24. Produce to multiple partitions
- [x] 25. Produce to multiple partitions of multiple topics

**Como o tester funciona:** para cada stage cria um `log.dirs` com o log de metadados
KRaft (FeatureLevel, TopicRecord e PartitionRecord em record batches com CRC-32C) e os
logs das partições, escreve um `server.properties` e inicia o broker. Depois age como
cliente Kafka e confere cada resposta campo a campo, inclusive se sobram bytes.

**O que falta:** Metadata/ListOffsets, `acks`, retenção de log e starters para outras
linguagens.

---

### ✅ grep — 33/33

**Foco:** motor de expressões regulares próprio (classes, âncoras, quantificadores gulosos
com backtracking, alternação, grupos, backreferences), `-o`, destaque ANSI, busca em
arquivos e recursiva.

**Implementação:** [`challenges/grep/java`](../../challenges/grep/java) ·
**Tester:** [`challenges/grep/tests/run-stages.mjs`](../../challenges/grep/tests/run-stages.mjs)

**Core:**

- [x] 1. Match a literal character
- [x] 2. Match digits
- [x] 3. Match word characters
- [x] 4. Positive Character Groups
- [x] 5. Negative Character Groups
- [x] 6. Combining Character Classes
- [x] 7. Start of string anchor
- [x] 8. End of string anchor
- [x] 9. Match one or more times
- [x] 10. Match zero or one times
- [x] 11. Wildcard
- [x] 12. Alternation

**Printing Matches:**

- [x] 13. Print a single matching line
- [x] 14. Print multiple matching lines

**Multiple Matches:**

- [x] 15. Print single match
- [x] 16. Print multiple matches
- [x] 17. Process multiple input lines

**Highlighting:**

- [x] 18. Highlight a single match
- [x] 19. Highlight multiple matches
- [x] 20. Highlight matches in multiple lines
- [x] 21. Disable highlighting
- [x] 22. Implement the auto color option

**File Search:**

- [x] 23. Search a single-line file
- [x] 24. Search a multi-line file
- [x] 25. Search multiple files
- [x] 26. Recursive search

**Quantifiers:**

- [x] 27. Match zero or more times
- [x] 28. Match exactly n times
- [x] 29. Match at least n times
- [x] 30. Match between n and m times

**Backreferences:**

- [x] 31. Single Backreference
- [x] 32. Multiple Backreferences
- [x] 33. Nested Backreferences

**Como o tester funciona:** gera entradas e padrões aleatórios e compara código de saída
e stdout com um oráculo baseado no `RegExp` do JavaScript (mesma semântica para o
subconjunto do desafio). Código que usa `java.util.regex` é recusado.

**O que falta:** `\s`, quantificadores preguiçosos, `-i`, `-v`, `-c` e starters para outras
linguagens.

---

### ⬜ Shell — 0/76

**Foco:** REPL, builtins, execução de programas, quoting, redirecionamento,
completion, background jobs, pipes, history e parameter expansion.

| Seção | Stages | Cobre | Status |
|---|---:|---|---|
| Core | 8 | prompt, REPL, `exit`, `echo`, `type`, PATH, exec | ⬜ |
| Navigation | 4 | `pwd`, `cd` absoluto/relativo/home | ⬜ |
| Quoting | 6 | aspas simples/duplas, backslash | ⬜ |
| Redirection | 4 | `>`, `2>`, `>>`, `2>>` | ⬜ |
| Command Completion | 6 | Tab, builtins, executáveis | ⬜ |
| Filename Completion | 7 | arquivos, diretórios, múltiplos matches | ⬜ |
| Programmable Completion | 10 | `complete` builtin e specs | ⬜ |
| Background Jobs | 9 | `jobs`, `&`, reap, job numbers | ⬜ |
| Pipelines | 3 | pipes entre 2+ comandos e builtins | ⬜ |
| History | 6 | `history`, setas, execução | ⬜ |
| History Persistence | 6 | ler/escrever arquivo, append | ⬜ |
| Parameter Expansion | 7 | `declare`, variáveis, `${var}` | ⬜ |

**O que falta:** tokenizer de linha de comando, parser de quoting,
gerenciamento de processos/pipes e completion readline.

---

### ⬜ Interpreter — 0/84

**Foco:** lexer, parser, AST, evaluator, statements, escopos, funções,
closures, resolver, classes e herança — um interpretador estilo Lox.

| Seção | Stages | Cobre | Status |
|---|---:|---|---|
| Core (scanning) | 15 | tokens, erros léxicos, strings, números, keywords | ⬜ |
| Parsing Expressions | 10 | literais, unários, binários, precedência, erros | ⬜ |
| Evaluating Expressions | 13 | valores, operadores, erros de runtime | ⬜ |
| Statements & State | 10 | `print`, variáveis, blocos, escopos | ⬜ |
| Control Flow | 9 | `if`, `else`, `or`, `and`, `while`, `for` | ⬜ |
| Functions | 9 | nativas, parâmetros, retorno, closures | ⬜ |
| Resolving & Binding | 4 | resolução de identificadores, redeclaração | ⬜ |
| Classes | 8 | classes, instâncias, métodos, `this`, construtor | ⬜ |
| Inheritance | 6 | herança, override, `super` | ⬜ |

**O que falta:** implementar a linguagem completa, incluindo resolução
semântica e classes; é o desafio mais longo do catálogo.

---

### ✅ Claude Code — 18/18

**Foco:** API Chat Completions, tool calling, agent loop, ferramentas de arquivo e shell,
skills (argumentos, composição, scripts, escolha pelo modelo, subagentes) e Language
Server Protocol (definition, references, sincronização e diagnostics).

**Implementação:** [`challenges/claude-code/java`](../../challenges/claude-code/java) ·
**Tester:** [`challenges/claude-code/tests/run-stages.mjs`](../../challenges/claude-code/tests/run-stages.mjs)

**Core + Skills:**

- [x] 1. Communicate with the LLM
- [x] 2. Advertise the read tool
- [x] 3. Execute the read tool
- [x] 4. Implement the agent loop
- [x] 5. Implement the write tool
- [x] 6. Implement the bash tool
- [x] 7. Advertise skills to the LLM
- [x] 8. Invoke a skill by name
- [x] 9. Pass arguments to a skill
- [x] 10. Stack multiple skills
- [x] 11. Run a script bundled with a skill
- [x] 12. Let the model choose a skill
- [x] 13. Run a skill in a subagent

**Language Server Protocol:**

- [x] 14. Add the LSP tool
- [x] 15. Find the implementation
- [x] 16. Find the affected callers
- [x] 17. Keep the analysis current
- [x] 18. Repair edits with diagnostics

**Como o tester funciona:** nenhuma API paga é usada. O tester sobe um LLM falso
compatível com Chat Completions, que responde com roteiros determinísticos e valida
cada request (ferramentas anunciadas, histórico, `tool_call_id`). Os stages de LSP usam um
language server de brinquedo em Node ([`lsp-server.mjs`](../../challenges/claude-code/tests/lsp-server.mjs)),
que só enxerga edições enviadas por `didOpen`/`didChange`.

**O que falta:** streaming, permissões antes de `write`/`bash` e starters para outras
linguagens.

---

## O que já existe neste repo

| Artefato | Para que serve |
|---|---|
| [`content/codecrafters/catalog.json`](../../content/codecrafters/catalog.json) | Catálogo público dos 12 desafios e 425 stages (gerado). |
| [`content/codecrafters/http-server`](../../content/codecrafters/http-server) | Curso, manifesto e instruções dos 14 stages. |
| [`scripts/sync-codecrafters-catalog.mjs`](../../scripts/sync-codecrafters-catalog.mjs) | Ressincroniza o catálogo a partir do site. |
| [`challenges/http-server/starter/java`](../../challenges/http-server/starter/java) | Starter repo Java do HTTP Server. |
| [`challenges/http-server/java`](../../challenges/http-server/java) | Implementação de referência Java 14/14. |
| [`challenges/http-server/tests`](../../challenges/http-server/tests) | Tester TCP cru + API `runStages`. |
| [`challenges/engine`](../../challenges/engine) | CLI `cc`, workspace, remote git, evaluator e hook. |
| [`app/projetos/codecrafters/[slug]`](../../app/projetos/codecrafters/%5Bslug%5D) | Página do desafio com stages, instruções e runner. |
| [`docs/codecrafters/http-server.md`](http-server.md) | Guia stage a stage do HTTP Server. |
| [`docs/codecrafters/redis.md`](redis.md) | Progresso e próximos passos do Redis. |

## Próximos passos da plataforma

**Concluído:** catálogo, seção em `/projetos`, página do desafio, instruções do HTTP
Server, starter repo Java, runner, CLI (`start`/`task`/`test`/`submit`), remote git
local `wizard`, hook `post-receive` e progresso por stage em JSON.

**Pendente:**

1. **Persistir no Prisma**: `Challenge`, `ChallengeStage`, `ChallengeProgress`
   (status por stage, tentativas, timestamps) e sincronizar com o estado JSON.
2. **Runner isolado**: container com limite de CPU/memória/tempo, diretório temporário
   e porta isolada; devolver JSON por stage.
3. **Outros starters**: Go, Python, Rust etc. para o HTTP Server.
4. **Próximos desafios**: Shell, Interpreter, Redis (ordem por número de stages).
5. **Conteúdo**: instruções em português para cada stage dos novos desafios.

## Convenções

- `✅` = todos os stages verificados localmente.
- `🟡` = em andamento; anote o próximo stage.
- `⬜` = não iniciado.
- Ao concluir um stage, marque o checkbox e atualize a linha de progresso no topo.
- O catálogo JSON é a fonte de verdade dos nomes/IDs; este documento é a fonte de verdade
  do **progresso** e das decisões.
