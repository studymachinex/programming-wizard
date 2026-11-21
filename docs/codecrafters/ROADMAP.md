# CodeCrafters no Programming Wizard

> Roadmap vivo dos desafios "Build your own X" do [CodeCrafters](https://app.codecrafters.io/catalog).
> Atualize os checkboxes conforme cada stage for concluído.

**Status geral:** **425/425 stages (100%)** · 12 desafios concluídos · todos jogáveis na plataforma.

**Integração na plataforma:** do desafio com menos stages para o com mais —
Git (7) ✅ → DNS Server (8) ✅ → Tokenizer (8) ✅ → SQLite (9) ✅ → Claude Code (18) ✅ → BitTorrent (19) ✅
→ Kafka (25) ✅ → grep (33) ✅ → Shell (76) ✅ → Interpreter (84) ✅ → Redis (124) ✅.

| # | Desafio | Stages | Progresso | Status | Acesso | Onde está |
|---:|---|---:|---:|---|---|---|
| 1 | [HTTP Server](https://app.codecrafters.io/courses/http-server/overview) | 14 | 14/14 | ✅ concluído | membros | [`challenges/http-server`](../../challenges/http-server) |
| 2 | [Redis](https://app.codecrafters.io/courses/redis/overview) | 124 | 124/124 | ✅ concluído | grátis até 31/12/2026 | [`challenges/redis`](../../challenges/redis) |
| 3 | [Git](https://app.codecrafters.io/courses/git/overview) | 7 | 7/7 | ✅ concluído | membros | [`challenges/git`](../../challenges/git) |
| 4 | [DNS Server](https://app.codecrafters.io/courses/dns-server/overview) | 8 | 8/8 | ✅ concluído | membros | [`challenges/dns-server`](../../challenges/dns-server) |
| 5 | [SQLite](https://app.codecrafters.io/courses/sqlite/overview) | 9 | 9/9 | ✅ concluído | membros | [`challenges/sqlite`](../../challenges/sqlite) |
| 6 | [Tokenizer](https://app.codecrafters.io/courses/tokenizer/overview) | 8 | 8/8 | ✅ concluído | early access | [`challenges/tokenizer`](../../challenges/tokenizer) |
| 7 | [BitTorrent](https://app.codecrafters.io/courses/bittorrent/overview) | 19 | 19/19 | ✅ concluído | membros | [`challenges/bittorrent`](../../challenges/bittorrent) |
| 8 | [Kafka](https://app.codecrafters.io/courses/kafka/overview) | 25 | 25/25 | ✅ concluído | membros | [`challenges/kafka`](../../challenges/kafka) |
| 9 | [grep](https://app.codecrafters.io/courses/grep/overview) | 33 | 33/33 | ✅ concluído | membros | [`challenges/grep`](../../challenges/grep) |
| 10 | [Shell](https://app.codecrafters.io/courses/shell/overview) | 76 | 76/76 | ✅ concluído | membros | [`challenges/shell`](../../challenges/shell) |
| 11 | [Interpreter](https://app.codecrafters.io/courses/interpreter/overview) | 84 | 84/84 | ✅ concluído | membros | [`challenges/interpreter`](../../challenges/interpreter) |
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

**Já implementado para HTTP Server, Git, DNS Server, Tokenizer, SQLite, Claude Code, BitTorrent, Kafka, grep, Shell, Interpreter e Redis:** catálogo, página, instruções, starter Java,
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

> Todos os desafios estão jogáveis na plataforma. A ordem acima continua sendo a sugestão de
> estudo; o progresso pessoal no Redis original fica em [`redis.md`](redis.md).

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

### ✅ Redis — 124/124

**Foco:** protocolo RESP, servidor TCP concorrente, estruturas de dados, expiração,
operações bloqueantes, transações e WATCH, replicação com WAIT, RDB/AOF, pub/sub, sorted
sets, bitmaps, geohash e autenticação com ACL.

**Implementação:** [`challenges/redis/java`](../../challenges/redis/java) ·
**Tester:** [`challenges/redis/tests/run-stages.mjs`](../../challenges/redis/tests/run-stages.mjs)

> O seu progresso pessoal no curso original (clone externo) continua registrado em
> [`redis.md`](redis.md); esta ficha é da versão da plataforma.

**Core:**

- [x] 1. Bind to a port
- [x] 2. Respond to PING
- [x] 3. Respond to multiple PINGs
- [x] 4. Handle concurrent clients
- [x] 5. Implement the ECHO command
- [x] 6. Implement the SET & GET commands
- [x] 7. Expiry

**Lists:**

- [x] 8. Create a list
- [x] 9. Append an element
- [x] 10. Append multiple elements
- [x] 11. List elements (positive indexes)
- [x] 12. List elements (negative indexes)
- [x] 13. Prepend elements
- [x] 14. Query list length
- [x] 15. Remove an element
- [x] 16. Remove multiple elements
- [x] 17. Blocking retrieval
- [x] 18. Blocking retrieval with timeout

**Streams:**

- [x] 19. The TYPE command
- [x] 20. Create a stream
- [x] 21. Validating entry IDs
- [x] 22. Partially auto-generated IDs
- [x] 23. Fully auto-generated IDs
- [x] 24. Query entries from stream
- [x] 25. Query with -
- [x] 26. Query with +
- [x] 27. Query single stream using XREAD
- [x] 28. Query multiple streams using XREAD
- [x] 29. Blocking reads
- [x] 30. Blocking reads without timeout
- [x] 31. Blocking reads using $

**Transactions:**

- [x] 32. The INCR command (1/3)
- [x] 33. The INCR command (2/3)
- [x] 34. The INCR command (3/3)
- [x] 35. The MULTI command
- [x] 36. The EXEC command
- [x] 37. Empty transaction
- [x] 38. Queueing commands
- [x] 39. Executing a transaction
- [x] 40. The DISCARD command
- [x] 41. Failures within transactions
- [x] 42. Multiple transactions

**Optimistic Locking:**

- [x] 43. The WATCH command
- [x] 44. WATCH inside transaction
- [x] 45. Tracking key modifications
- [x] 46. Watching multiple keys
- [x] 47. Watching missing keys
- [x] 48. The UNWATCH command
- [x] 49. Unwatch on EXEC
- [x] 50. Unwatch on DISCARD

**Replication:**

- [x] 51. Configure listening port
- [x] 52. The INFO command
- [x] 53. The INFO command on a replica
- [x] 54. Initial replication ID and offset
- [x] 55. Send handshake (1/3)
- [x] 56. Send handshake (2/3)
- [x] 57. Send handshake (3/3)
- [x] 58. Receive handshake (1/2)
- [x] 59. Receive handshake (2/2)
- [x] 60. Empty RDB transfer
- [x] 61. Single-replica propagation
- [x] 62. Multi-replica propagation
- [x] 63. Command processing
- [x] 64. ACKs with no commands
- [x] 65. ACKs with commands
- [x] 66. WAIT with no replicas
- [x] 67. WAIT with no commands
- [x] 68. WAIT with multiple commands

**RDB Persistence:**

- [x] 69. RDB file config
- [x] 70. Read a key
- [x] 71. Read a string value
- [x] 72. Read multiple keys
- [x] 73. Read multiple string values
- [x] 74. Read value with expiry

**AOF Persistence:**

- [x] 75. Default AOF options
- [x] 76. AOF options from flags
- [x] 77. Create append-only directory
- [x] 78. Create append-only file
- [x] 79. Create manifest file
- [x] 80. Write a single command
- [x] 81. Write multiple commands
- [x] 82. Filter write commands
- [x] 83. Replay a single command
- [x] 84. Replay multiple commands

**Pub/Sub:**

- [x] 85. Subscribe to a channel
- [x] 86. Subscribe to multiple channels
- [x] 87. Enter subscribed mode
- [x] 88. PING in subscribed mode
- [x] 89. Publish a message
- [x] 90. Deliver messages
- [x] 91. Unsubscribe

**Sorted Sets:**

- [x] 92. Create a sorted set
- [x] 93. Add members
- [x] 94. Retrieve member rank
- [x] 95. List sorted set members
- [x] 96. ZRANGE with negative indexes
- [x] 97. Count sorted set members
- [x] 98. Retrieve member score
- [x] 99. Remove a member

**Bitmaps:**

- [x] 100. Create a bitmap
- [x] 101. Retrieve a bit
- [x] 102. Read a string as bits
- [x] 103. Read bits as a string
- [x] 104. Grow a bitmap
- [x] 105. Count set bits
- [x] 106. AND two bitmaps
- [x] 107. AND bitmaps of different lengths
- [x] 108. OR two bitmaps

**Geospatial Commands:**

- [x] 109. Respond to GEOADD
- [x] 110. Validate coordinates
- [x] 111. Store a location
- [x] 112. Calculate location score
- [x] 113. Respond to GEOPOS
- [x] 114. Decode coordinates
- [x] 115. Calculate distance
- [x] 116. Search within radius

**Authentication:**

- [x] 117. Respond to ACL WHOAMI
- [x] 118. Respond to ACL GETUSER
- [x] 119. The nopass flag
- [x] 120. The passwords property
- [x] 121. Setting default user password
- [x] 122. The AUTH command
- [x] 123. Enforce authentication
- [x] 124. Authenticate using AUTH

**Como o tester funciona:** sobe o servidor sempre com `--port` numa porta livre e conversa
em RESP como um cliente. Nos stages de replicação ele é o master falso (confere o
handshake, envia RDB vazio, propaga comandos, pede GETACK) ou réplicas falsas (recebe a
propagação e responde ACKs). Os arquivos RDB e AOF são gerados pelo tester, e o geohash é
conferido com uma implementação em JS. Os resultados de geohash e distância foram
comparados com um Redis 7 real. Validado em Windows e Linux.

**O que falta:** hashes e sets, `PSUBSCRIBE`, reescrita do AOF (`BGREWRITEAOF`), resync
parcial (`PSYNC <id> <offset>`), mais regras de ACL e starters para outras linguagens.

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

### ✅ Shell — 76/76

**Foco:** REPL, builtins, execução de programas, quoting, redirecionamento, autocompletar
(comandos, arquivos e completers programáveis), jobs em background, pipelines, histórico
(setas e persistência) e expansão de variáveis.

**Implementação:** [`challenges/shell/java`](../../challenges/shell/java) ·
**Tester:** [`challenges/shell/tests/run-stages.mjs`](../../challenges/shell/tests/run-stages.mjs)

**Core:**

- [x] 1. Print a prompt
- [x] 2. Handle invalid commands
- [x] 3. Implement a REPL
- [x] 4. Implement exit
- [x] 5. Implement echo
- [x] 6. Implement type
- [x] 7. Locate executable files
- [x] 8. Run a program

**Navigation:**

- [x] 9. The pwd builtin
- [x] 10. The cd builtin: Absolute paths
- [x] 11. The cd builtin: Relative paths
- [x] 12. The cd builtin: Home directory

**Quoting:**

- [x] 13. Single quotes
- [x] 14. Double quotes
- [x] 15. Backslash outside quotes
- [x] 16. Backslash within single quotes
- [x] 17. Backslash within double quotes
- [x] 18. Executing a quoted executable

**Redirection:**

- [x] 19. Redirect stdout
- [x] 20. Redirect stderr
- [x] 21. Append stdout
- [x] 22. Append stderr

**Command Completion:**

- [x] 23. Builtin completion
- [x] 24. Completion with arguments
- [x] 25. Missing completions
- [x] 26. Executable completion
- [x] 27. Multiple completions
- [x] 28. Partial completions

**Filename Completion:**

- [x] 29. File completion
- [x] 30. Nested file completion
- [x] 31. Directory completion
- [x] 32. Missing completions
- [x] 33. Multiple matches
- [x] 34. Partial completions
- [x] 35. Multi-argument completions

**Programmable Completion:**

- [x] 36. Register complete builtin
- [x] 37. Printing missing specifications
- [x] 38. Displaying registered specifications
- [x] 39. Single completion
- [x] 40. Handling no completions
- [x] 41. Passing command-line arguments
- [x] 42. Passing environment variables
- [x] 43. Multiple completer candidates
- [x] 44. Longest common prefix
- [x] 45. Unregister a completion

**Background Jobs:**

- [x] 46. The jobs builtin
- [x] 47. Starting background jobs
- [x] 48. Printing background job output
- [x] 49. List a single job
- [x] 50. List multiple jobs
- [x] 51. Reap one job
- [x] 52. Reap multiple jobs
- [x] 53. Reap before the next prompt
- [x] 54. Recycle job numbers

**Pipelines:**

- [x] 55. Dual-command pipeline
- [x] 56. Pipelines with built-ins
- [x] 57. Multi-command pipelines

**History:**

- [x] 58. The history builtin
- [x] 59. Listing history
- [x] 60. Limiting history entries
- [x] 61. Up-arrow navigation
- [x] 62. Down-arrow navigation
- [x] 63. Executing commands from history

**History Persistence:**

- [x] 64. Read history from file
- [x] 65. Write history to file
- [x] 66. Append history to file
- [x] 67. Read history on startup
- [x] 68. Write history on exit
- [x] 69. Append history on exit

**Parameter Expansion:**

- [x] 70. The declare builtin
- [x] 71. Printing missing variables
- [x] 72. Storing shell variables
- [x] 73. Validating variable names
- [x] 74. Expanding variables
- [x] 75. Expansion with braces
- [x] 76. Expanding empty variables

**Como o tester funciona:** sem pseudo-terminal. O tester escreve no stdin os bytes
digitados (Tab = `\t`, setas = `ESC [ A/B`, Backspace = 127), lê stdout+stderr mesclados
num pipe (`2>&1` via `sh`/`cmd`) e interpreta a saída com um emulador de terminal mínimo
(`\r`, `\b`, `ESC[K`, BEL). Nos stages de linha inteira, se o shell não ecoa a entrada, o
tester desenha a linha sozinho; nos de teclas, o eco é do shell. Os programas externos são
scripts Node do próprio tester (`.cmd` no Windows), então os resultados são iguais em
Linux, macOS e Windows. Validado em Windows e em Linux (container).

**O que falta:** word splitting de expansões, `$?`, `&&`/`||`, `fg`/`bg`/sinais, edição no
meio da linha (setas ←/→) e starters para outras linguagens.

---

### ✅ Interpreter — 84/84

**Foco:** lexer, parser descendente recursivo, AST, avaliação de expressões, statements, escopos,
controle de fluxo, funções e closures, resolução estática, classes e herança — Lox, a linguagem
do livro *Crafting Interpreters* (Robert Nystrom).

**Implementação:** [`challenges/interpreter/java`](../../challenges/interpreter/java) ·
**Tester:** [`challenges/interpreter/tests/run-stages.mjs`](../../challenges/interpreter/tests/run-stages.mjs)

**Core:**

- [x] 1. Scanning: Empty file
- [x] 2. Scanning: Parentheses
- [x] 3. Scanning: Braces
- [x] 4. Scanning: Other single-character tokens
- [x] 5. Scanning: Lexical errors
- [x] 6. Scanning: Assignment & equality Operators
- [x] 7. Scanning: Negation & inequality operators
- [x] 8. Scanning: Relational operators
- [x] 9. Scanning: Division operator & comments
- [x] 10. Scanning: Whitespace
- [x] 11. Scanning: Multi-line errors
- [x] 12. Scanning: String literals
- [x] 13. Scanning: Number literals
- [x] 14. Scanning: Identifiers
- [x] 15. Scanning: Reserved words

**Parsing Expressions:**

- [x] 16. Booleans & Nil
- [x] 17. Number literals
- [x] 18. String literals
- [x] 19. Parentheses
- [x] 20. Unary Operators
- [x] 21. Arithmetic operators (1/2)
- [x] 22. Arithmetic operators (2/2)
- [x] 23. Comparison operators
- [x] 24. Equality operators
- [x] 25. Syntactic errors

**Evaluating Expressions:**

- [x] 26. Literals: Booleans & Nil
- [x] 27. Literals: Strings & Numbers
- [x] 28. Parentheses
- [x] 29. Unary Operators: Negation & Not
- [x] 30. Arithmetic Operators (1/2)
- [x] 31. Arithmetic Operators (2/2)
- [x] 32. String Concatenation
- [x] 33. Relational Operators
- [x] 34. Equality Operators
- [x] 35. Runtime Errors: Unary Operators
- [x] 36. Runtime Errors: Binary Operators (1/2)
- [x] 37. Runtime Errors: Binary Operators (2/2)
- [x] 38. Runtime Errors: Relational Operators

**Statements & State:**

- [x] 39. Print: Generate output
- [x] 40. Print: Multiple statements
- [x] 41. Expression statements
- [x] 42. Variables: Declare variables
- [x] 43. Variables: Runtime Errors
- [x] 44. Variables: Initialize variables
- [x] 45. Variables: Redeclare variables
- [x] 46. Assignment operation
- [x] 47. Block syntax
- [x] 48. Scopes

**Control Flow:**

- [x] 49. If statements
- [x] 50. Else statements
- [x] 51. Else-if statements
- [x] 52. Nested if statements
- [x] 53. Logical OR operator
- [x] 54. Logical AND operator
- [x] 55. While statements
- [x] 56. For statements
- [x] 57. Syntactic errors

**Functions:**

- [x] 58. Native functions
- [x] 59. Functions without arguments
- [x] 60. Functions with arguments
- [x] 61. Syntax errors
- [x] 62. Return statements
- [x] 63. Higher order functions
- [x] 64. Runtime errors
- [x] 65. Function scope
- [x] 66. Closures

**Resolving & Binding:**

- [x] 67. Identifier Resolution
- [x] 68. Self Initialization
- [x] 69. Variable Redeclaration
- [x] 70. Invalid Return

**Classes:**

- [x] 71. Class Declarations
- [x] 72. Class Instances
- [x] 73. Getters & Setters
- [x] 74. Instance Methods
- [x] 75. The 'this' keyword
- [x] 76. Invalid usages of 'this'
- [x] 77. Constructor calls
- [x] 78. Return within constructors

**Inheritance:**

- [x] 79. Class Hierarchy
- [x] 80. Inheriting Methods
- [x] 81. Overriding Methods
- [x] 82. Inheritance errors
- [x] 83. The super keyword
- [x] 84. Invalid Usages of the super Keyword

**Como o tester funciona:** `tokenize` é comparado com um scanner de referência em JavaScript
sobre fontes aleatórias; `parse`/`evaluate` usam expressões aleatórias geradas a partir da
gramática, com a árvore e o valor esperados calculados pelo gerador; os stages de `run` usam
programas escritos para cada stage com nomes e valores sorteados. Erros conferem o código de
saída (65 estático, 70 em execução), a linha e a mensagem. Validado em Windows e Linux.

**O que falta:** `break`/`continue`, funções anônimas, uma biblioteca padrão maior e starters
para outras linguagens.

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
4. **Desafios**: os 12 do catálogo estão integrados.
5. **Conteúdo**: instruções em português para cada stage dos novos desafios.

## Convenções

- `✅` = todos os stages verificados localmente.
- `🟡` = em andamento; anote o próximo stage.
- `⬜` = não iniciado.
- Ao concluir um stage, marque o checkbox e atualize a linha de progresso no topo.
- O catálogo JSON é a fonte de verdade dos nomes/IDs; este documento é a fonte de verdade
  do **progresso** e das decisões.
