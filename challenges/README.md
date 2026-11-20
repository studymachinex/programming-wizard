# Desafios "Build your own X"

Implementações de referência e engine dos desafios do
[CodeCrafters](https://app.codecrafters.io/catalog), integrados à aba
[Projetos](../app/projetos/page.tsx) do Programming Wizard.

## Desafios

| Desafio | Stages | Plataforma | Referência |
|---|---:|---|---|
| HTTP Server | 14 | ✅ jogável | ✅ 14/14 |
| Redis | 124 | ⬜ em breve | 🟡 3/124 (clone externo) |
| Git | 7 | ✅ jogável | ✅ 7/7 |
| DNS Server | 8 | ✅ jogável | ✅ 8/8 |
| SQLite | 9 | ✅ jogável | ✅ 9/9 |
| Tokenizer | 8 | ✅ jogável | ✅ 8/8 |
| BitTorrent | 19 | ✅ jogável | ✅ 19/19 |
| Kafka | 25 | ✅ jogável | ✅ 25/25 |
| grep | 33 | ✅ jogável | ✅ 33/33 |
| Shell | 76 | ⬜ em breve | ⬜ |
| Interpreter | 84 | ⬜ em breve | ⬜ |
| Claude Code | 18 | ✅ jogável | ✅ 18/18 |

O progresso detalhado e os tópicos de cada desafio ficam em
[`docs/codecrafters/ROADMAP.md`](../docs/codecrafters/ROADMAP.md). O progresso do
usuário fica em `challenges/.workspaces/.state/<desafio>.json` (ignorado pelo git).

## Como o fluxo funciona

```text
npm run cc -- start http-server
        │
        ├─ copia challenges/http-server/starter/java
        │  para challenges/.workspaces/http-server-java
        ├─ git init + commit inicial
        └─ remote "wizard" → challenges/.workspaces/.remotes/http-server.git
                                └─ hook post-receive
                                     ├─ checkout do commit em worktree temporário
                                     ├─ mvn package
                                     ├─ runStages() via TCP cru
                                     └─ grava o progresso
```

Comandos, a partir da raiz:

```bash
npm run cc -- start http-server   # cria/ativa o workspace
npm run cc -- task               # instruções do stage atual
npm run cc -- task --stage 4     # stage específico (ordem, id ou slug)
npm run cc -- test               # compila + testa, sem commitar
npm run cc -- submit             # commit + push; hook roda os testes
npm run cc -- status             # checklist e último resultado
npm run cc -- list               # catálogo com progresso
npm run cc -- reset --yes        # zera o progresso, mantém o código

`test` e `submit` rodam todos os stages, mas o resultado considerado é o do stage
atual. `start --force` apaga o workspace, zera o progresso e recria o remote local.
```

Equivalente manual:

```bash
cd challenges/.workspaces/http-server-java
git add -A
git commit -m "codecrafters submit [skip ci]"
git push wizard master
```

O `git push` é o gatilho real: o hook `post-receive` do remote local é o
equivalente ao test runner server-side do CodeCrafters.

## Convenção de pastas

```text
challenges/
  engine/
    cc.mjs                    # CLI (start, task, test, submit, status, list)
    post-receive.mjs          # hook executado pelo remote local
    lib/
      catalog.mjs             # catálogo + curso + instructions
      evaluate.mjs            # compile + runStages + persistência
      paths.mjs               # workspaces, remotes, estado e logs
      proc.mjs                # spawn/timeout/tail
      state.mjs               # progresso por stage
      workspace.mjs           # starter, git init, remote e hook
  http-server/
    starter/java/             # repo inicial (Main.java com TODO)
    java/                     # implementação de referência 14/14
    tests/
      run-stages.mjs          # implementação + CLI
      stages.mjs              # API exportada para o runner
  .workspaces/                # runtime, ignorado pelo git
    http-server-java/         # seu repo de trabalho
    .remotes/http-server.git/ # remote bare + hook
    .state/http-server.json   # progresso e histórico
```

## HTTP Server

- Curso e instruções: [`content/codecrafters/http-server`](../content/codecrafters/http-server).
- Starter: [`http-server/starter/java`](http-server/starter/java).
- Referência: [`http-server/java`](http-server/java).
- Tester: [`http-server/tests/run-stages.mjs`](http-server/tests/run-stages.mjs).

Rodar o tester contra a referência:

```bash
npm run challenge:http
```

Rodar contra qualquer worktree:

```bash
node challenges/http-server/tests/run-stages.mjs --dir <pasta> --no-build
```

## Git

- Curso e instruções: [`content/codecrafters/git`](../content/codecrafters/git).
- Starter: [`git/starter/java`](git/starter/java).
- Referência: [`git/java`](git/java).
- Tester: [`git/tests/run-stages.mjs`](git/tests/run-stages.mjs).

Diferente do HTTP Server, o Git é um desafio de CLI: o tester executa
`java -jar target/git.jar <comando>` em pastas temporárias e confere o resultado com o
git real. O stage de clone sobe um servidor smart HTTP local (`git http-backend`), então
roda offline.

```bash
npm run challenge:git                                         # contra a referência
node challenges/git/tests/run-stages.mjs --dir <pasta> --no-build
```

## DNS Server

- Curso e instruções: [`content/codecrafters/dns-server`](../content/codecrafters/dns-server).
- Starter: [`dns-server/starter/java`](dns-server/starter/java).
- Referência: [`dns-server/java`](dns-server/java).
- Tester: [`dns-server/tests/run-stages.mjs`](dns-server/tests/run-stages.mjs).

Servidor UDP na porta 2053. O tester sobe um resolver DNS falso e inicia o servidor com
`--resolver 127.0.0.1:<porta>`; o stage 8 exige que cada pergunta seja encaminhada a ele.

```bash
npm run challenge:dns                                               # contra a referência
node challenges/dns-server/tests/run-stages.mjs --dir <pasta> --no-build
```

## Tokenizer

- Curso e instruções: [`content/codecrafters/tokenizer`](../content/codecrafters/tokenizer).
- Starter: [`tokenizer/starter/java`](tokenizer/starter/java).
- Referência: [`tokenizer/java`](tokenizer/java).
- Tester: [`tokenizer/tests/run-stages.mjs`](tokenizer/tests/run-stages.mjs).
- Vocabulário do GPT-2: [`tokenizer/data/gpt2`](tokenizer/data/gpt2) (licença MIT da OpenAI).

Desafio de CLI sem rede: cada comando (`bytes`, `pair`, `merge`, `train`, `encode`,
`decode`, `split`, `gpt2`) recebe a entrada pelo stdin, e a saída é comparada com uma
implementação de referência em JavaScript.

```bash
npm run challenge:tokenizer                                         # contra a referência
node challenges/tokenizer/tests/run-stages.mjs --dir <pasta> --no-build
```

## SQLite

- Curso e instruções: [`content/codecrafters/sqlite`](../content/codecrafters/sqlite).
- Starter: [`sqlite/starter/java`](sqlite/starter/java).
- Referência: [`sqlite/java`](sqlite/java).
- Tester: [`sqlite/tests/run-stages.mjs`](sqlite/tests/run-stages.mjs).

O programa lê arquivos `.db` sem biblioteca: `your_program.sh <banco> .dbinfo | .tables |
"SELECT ..."`. O tester gera bancos aleatórios com `node:sqlite` (Node 22.13+) e usa o
próprio SQLite como oráculo; no stage 9 ele zera as folhas da tabela que não interessam
à consulta, então só uma busca pelo índice responde.

```bash
npm run challenge:sqlite                                         # contra a referência
node challenges/sqlite/tests/run-stages.mjs --dir <pasta> --no-build
```

## Claude Code

- Curso e instruções: [`content/codecrafters/claude-code`](../content/codecrafters/claude-code).
- Starter: [`claude-code/starter/java`](claude-code/starter/java) (inclui um `Json.java` pronto).
- Referência: [`claude-code/java`](claude-code/java).
- Tester: [`claude-code/tests/run-stages.mjs`](claude-code/tests/run-stages.mjs) e o
  language server de brinquedo [`claude-code/tests/lsp-server.mjs`](claude-code/tests/lsp-server.mjs).

Um agente de código (`your_program.sh -p "<prompt>"`) que fala com qualquer API compatível
com Chat Completions (`OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODEL`). Nos testes, um LLM
falso responde com roteiros determinísticos — nenhuma API paga é usada.

```bash
npm run challenge:claude-code                                         # contra a referência
node challenges/claude-code/tests/run-stages.mjs --dir <pasta> --no-build
```

## BitTorrent

- Curso e instruções: [`content/codecrafters/bittorrent`](../content/codecrafters/bittorrent).
- Starter: [`bittorrent/starter/java`](bittorrent/starter/java).
- Referência: [`bittorrent/java`](bittorrent/java).
- Tester: [`bittorrent/tests/run-stages.mjs`](bittorrent/tests/run-stages.mjs).

Cliente BitTorrent de linha de comando (`decode`, `info`, `peers`, `handshake`,
`download_piece`, `download` e os equivalentes `magnet_*`). O tester sobe um tracker HTTP
e peers TCP locais que validam o protocolo, inclusive a extensão de metadados (BEP 9/10).

```bash
npm run challenge:bittorrent                                         # contra a referência
node challenges/bittorrent/tests/run-stages.mjs --dir <pasta> --no-build
```

## Kafka

- Curso e instruções: [`content/codecrafters/kafka`](../content/codecrafters/kafka).
- Starter: [`kafka/starter/java`](kafka/starter/java).
- Referência: [`kafka/java`](kafka/java).
- Tester: [`kafka/tests/run-stages.mjs`](kafka/tests/run-stages.mjs).

Broker Kafka (`your_program.sh <server.properties>`) com ApiVersions v4,
DescribeTopicPartitions v0, Fetch v16 e Produce v11. O tester gera o log de metadados
KRaft e os logs das partições e age como cliente, validando cada resposta byte a byte.

```bash
npm run challenge:kafka                                         # contra a referência
node challenges/kafka/tests/run-stages.mjs --dir <pasta> --no-build
```

## grep

- Curso e instruções: [`content/codecrafters/grep`](../content/codecrafters/grep).
- Starter: [`grep/starter/java`](grep/starter/java).
- Referência: [`grep/java`](grep/java).
- Tester: [`grep/tests/run-stages.mjs`](grep/tests/run-stages.mjs).

Um `grep -E` com motor de regex próprio, `-o`, `--color`, arquivos e `-r`. O tester
compara com um oráculo em JavaScript e recusa código que use `java.util.regex`.

```bash
npm run challenge:grep                                         # contra a referência
node challenges/grep/tests/run-stages.mjs --dir <pasta> --no-build
```

## Próximos desafios

A integração segue do desafio com menos stages para o com mais: Shell (76),
Interpreter (84) e Redis (124).


Para adicionar um desafio, o contrato é:

1. `content/codecrafters/<slug>/course.json` com metadados, `runtime` e stages.
2. `content/codecrafters/<slug>/stages/*.md` com as instruções.
3. `challenges/<slug>/starter/<linguagem>` com o repo inicial.
4. `challenges/<slug>/tests/stages.mjs` exportando `runStages({ workspaceDir, build })`.
5. O `runtime.runner` do curso aponta para esse módulo.

O engine, o hook e a UI funcionam sem mudança para qualquer desafio que cumpra esse
contrato.
