# CodeCrafters no Programming Wizard

> Roadmap vivo dos desafios "Build your own X" do [CodeCrafters](https://app.codecrafters.io/catalog).
> Atualize os checkboxes conforme cada stage for concluído.

**Status geral:** **17/425 stages (4%)** · 1 desafio concluído · 1 em andamento · HTTP Server jogável na plataforma.

| # | Desafio | Stages | Progresso | Status | Acesso | Onde está |
|---:|---|---:|---:|---|---|---|
| 1 | [HTTP Server](https://app.codecrafters.io/courses/http-server/overview) | 14 | 14/14 | ✅ concluído | membros | [`challenges/http-server`](../../challenges/http-server) |
| 2 | [Redis](https://app.codecrafters.io/courses/redis/overview) | 124 | 3/124 | 🟡 em andamento | grátis até 31/12/2026 | clone local `codecrafters-redis-java` |
| 3 | [Git](https://app.codecrafters.io/courses/git/overview) | 7 | 0/7 | ⬜ não iniciado | membros | — |
| 4 | [DNS Server](https://app.codecrafters.io/courses/dns-server/overview) | 8 | 0/8 | ⬜ não iniciado | membros | — |
| 5 | [SQLite](https://app.codecrafters.io/courses/sqlite/overview) | 9 | 0/9 | ⬜ não iniciado | membros | — |
| 6 | [Tokenizer](https://app.codecrafters.io/courses/tokenizer/overview) | 8 | 0/8 | ⬜ não iniciado | early access | — |
| 7 | [BitTorrent](https://app.codecrafters.io/courses/bittorrent/overview) | 19 | 0/19 | ⬜ não iniciado | membros | — |
| 8 | [Kafka](https://app.codecrafters.io/courses/kafka/overview) | 25 | 0/25 | ⬜ não iniciado | membros | — |
| 9 | [grep](https://app.codecrafters.io/courses/grep/overview) | 33 | 0/33 | ⬜ não iniciado | membros | — |
| 10 | [Shell](https://app.codecrafters.io/courses/shell/overview) | 76 | 0/76 | ⬜ não iniciado | membros | — |
| 11 | [Interpreter](https://app.codecrafters.io/courses/interpreter/overview) | 84 | 0/84 | ⬜ não iniciado | membros | — |
| 12 | [Claude Code](https://app.codecrafters.io/courses/claude-code/overview) | 18 | 0/18 | ⬜ não iniciado | beta | — |

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

**Já implementado para HTTP Server:** catálogo, página, instruções, starter Java,
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

### ⬜ Git — 0/7

**Foco:** formato `.git`, SHA-1, zlib, objetos blob/tree/commit, index e clone.

- [ ] 1. Initialize the `.git` directory
- [ ] 2. Read a blob object
- [ ] 3. Create a blob object
- [ ] 4. Read a tree object
- [ ] 5. Write a tree object
- [ ] 6. Create a commit
- [ ] 7. Clone a repository

**O que falta:** CLI com `init`, `cat-file -p`, `hash-object -w`, `ls-tree`,
`write-tree`, `commit-tree` e `clone`; leitura/escrita de objetos comprimidos e packfiles.

---

### ⬜ DNS Server — 0/8

**Foco:** UDP, header DNS, flags, QNAME, answer records, compressão de nomes e forwarding.

- [ ] 1. Setup UDP server
- [ ] 2. Write header section
- [ ] 3. Write question section
- [ ] 4. Write answer section
- [ ] 5. Parse header section
- [ ] 6. Parse question section
- [ ] 7. Parse compressed packet
- [ ] 8. Forwarding Server

**O que falta:** servidor UDP em `127.0.0.1:2053`, encoder/decoder de pacotes,
respostas A/AAAA e proxy para um resolver upstream.

---

### ⬜ SQLite — 0/9

**Foco:** formato de arquivo, page size, B-tree, schema, record format, WHERE e índices.

- [ ] 1. Print page size
- [ ] 2. Print number of tables
- [ ] 3. Print table names
- [ ] 4. Count rows in a table
- [ ] 5. Read data from a single column
- [ ] 6. Read data from multiple columns
- [ ] 7. Filter data with a WHERE clause
- [ ] 8. Retrieve data using a full-table scan
- [ ] 9. Retrieve data using an index

**O que falta:** parser do header de 100 bytes, traversal de B-tree pages,
varints/serial types, leitura de registros e uso de índices.

---

### ⬜ Tokenizer — 0/8

**Foco:** UTF-8, byte-pair encoding, merges, encode/decode e vocabulário GPT-2.

- [ ] 1. UTF-8 bytes
- [ ] 2. Most frequent pair
- [ ] 3. Merge a pair
- [ ] 4. Learn merges
- [ ] 5. Encode
- [ ] 6. Decode
- [ ] 7. Split like GPT-2
- [ ] 8. Match GPT-2

**O que falta:** treinar merges, implementar o loop de BPE, vocabulário e
tokenização compatível com GPT-2.

---

### ⬜ BitTorrent — 0/19

**Foco:** bencode, arquivos `.torrent`, info hash, tracker, peer protocol e magnet links.

**Core:**

- [ ] 1. Decode bencoded strings
- [ ] 2. Decode bencoded integers
- [ ] 3. Decode bencoded lists
- [ ] 4. Decode bencoded dictionaries
- [ ] 5. Parse torrent file
- [ ] 6. Calculate info hash
- [ ] 7. Piece hashes
- [ ] 8. Discover peers
- [ ] 9. Peer handshake
- [ ] 10. Download a piece
- [ ] 11. Download the whole file

**Magnet Links:**

- [ ] 12. Parse magnet link
- [ ] 13. Announce extension support
- [ ] 14. Send extension handshake
- [ ] 15. Receive extension handshake
- [ ] 16. Request metadata
- [ ] 17. Receive metadata
- [ ] 18. Download a piece
- [ ] 19. Download the whole file

**O que falta:** decoder/encoder bencode, HTTP tracker, handshake, download
de pieces com verificação SHA-1 e extensão `ut_metadata` para magnet links.

---

### ⬜ Kafka — 0/25

**Foco:** protocolo binário Kafka, correlação de requests, ApiVersions,
partições, Fetch, Produce e record batches.

**Core + clientes:**

- [ ] 1. Bind to a port
- [ ] 2. Send Correlation ID
- [ ] 3. Parse Correlation ID
- [ ] 4. Parse API Version
- [ ] 5. Handle ApiVersions requests
- [ ] 6. Serial requests
- [ ] 7. Concurrent requests

**Listing Partitions:**

- [ ] 8. Include DescribeTopicPartitions in ApiVersions
- [ ] 9. List for an unknown topic
- [ ] 10. List for a single partition
- [ ] 11. List for multiple partitions
- [ ] 12. List for multiple topics

**Consuming Messages:**

- [ ] 13. Include Fetch in ApiVersions
- [ ] 14. Fetch with no topics
- [ ] 15. Fetch with an unknown topic
- [ ] 16. Fetch with an empty topic
- [ ] 17. Fetch single message from disk
- [ ] 18. Fetch multiple messages from disk

**Producing Messages:**

- [ ] 19. Include Produce in ApiVersions
- [ ] 20. Respond for invalid topic or partition
- [ ] 21. Respond for valid topic and partition
- [ ] 22. Produce a single record
- [ ] 23. Produce multiple records
- [ ] 24. Produce to multiple partitions
- [ ] 25. Produce to multiple partitions of multiple topics

**O que falta:** framing binário, CRC32C, record batch format, leitura/escrita
dos arquivos de log e cluster metadata.

---

### ⬜ grep — 0/33

**Foco:** engine de regex (character classes, anchors, quantifiers, alternation,
backreferences), impressão de linhas, highlighting e busca em arquivos.

| Seção | Stages | Cobre | Status |
|---|---:|---|---|
| Core | 12 | literais, classes, âncoras, `+`, `?`, `.`, alternation | ⬜ |
| Printing Matches | 2 | imprimir linha(s) que casam | ⬜ |
| Multiple Matches | 3 | múltiplos matches por linha e múltiplas linhas | ⬜ |
| Highlighting | 5 | cores, `--color`, auto | ⬜ |
| File Search | 4 | arquivos, múltiplos arquivos, recursivo | ⬜ |
| Quantifiers | 4 | `*`, `{n}`, `{n,}`, `{n,m}` | ⬜ |
| Backreferences | 3 | `\1`, múltiplos e aninhados | ⬜ |

**O que falta:** parser + matcher de regex, output formatado e caminhamento de diretórios.

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

### ⬜ Claude Code — 0/18

**Foco:** LLM APIs, tool calling, agent loop, ferramentas de arquivo/bash,
skills, subagentes e Language Server Protocol.

**Core + Skills:**

- [ ] 1. Communicate with the LLM
- [ ] 2. Advertise the read tool
- [ ] 3. Execute the read tool
- [ ] 4. Implement the agent loop
- [ ] 5. Implement the write tool
- [ ] 6. Implement the bash tool
- [ ] 7. Advertise skills to the LLM
- [ ] 8. Invoke a skill by name
- [ ] 9. Pass arguments to a skill
- [ ] 10. Stack multiple skills
- [ ] 11. Run a script bundled with a skill
- [ ] 12. Let the model choose a skill
- [ ] 13. Run a skill in a subagent

**Language Server Protocol:**

- [ ] 14. Add the LSP tool
- [ ] 15. Find the implementation
- [ ] 16. Find the affected callers
- [ ] 17. Keep the analysis current
- [ ] 18. Repair edits with diagnostics

**O que falta:** cliente de LLM, tool schemas, loop de mensagens,
sandbox de tools, skills e integração LSP.

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
4. **Próximos desafios**: Redis core (RESP + concorrência), Git, DNS, SQLite.
5. **Conteúdo**: instruções em português para cada stage dos novos desafios.

## Convenções

- `✅` = todos os stages verificados localmente.
- `🟡` = em andamento; anote o próximo stage.
- `⬜` = não iniciado.
- Ao concluir um stage, marque o checkbox e atualize a linha de progresso no topo.
- O catálogo JSON é a fonte de verdade dos nomes/IDs; este documento é a fonte de verdade
  do **progresso** e das decisões.
