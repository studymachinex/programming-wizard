# Programming Wizard

**Plataforma local e open source de estudos de engenharia de software, em português.**

Trilhas de Java, exercícios, revisão espaçada, capstones de portfólio e desafios
“Build your own X” no estilo CodeCrafters — tudo rodando na sua máquina, com o seu
PostgreSQL e sem login.

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **English:** Programming Wizard is a local-first, open-source study platform for
> software engineering. It includes guided Java tracks, exercises, spaced repetition,
> portfolio capstones and a local CodeCrafters-style challenge runner. The learning
> content is in Portuguese. See [Como rodar](#como-rodar) to run it locally.

![Página de projetos com o catálogo CodeCrafters](docs/screenshots/projects.png)

## Índice

- [O que é](#o-que-é)
- [Destaques](#destaques)
- [Stack](#stack)
- [Requisitos](#requisitos)
- [Como rodar](#como-rodar)
- [Configuração](#configuração)
- [Scripts](#scripts)
- [Como usar a plataforma](#como-usar-a-plataforma)
- [Desafios CodeCrafters locais](#desafios-codecrafters-locais)
- [Conteúdo e autoria](#conteúdo-e-autoria)
- [Estrutura do projeto](#estrutura-do-projeto)
- [API interna](#api-interna)
- [Desenvolvimento](#desenvolvimento)
- [Solução de problemas](#solução-de-problemas)
- [Limitações conhecidas](#limitações-conhecidas)
- [Contribuindo](#contribuindo)
- [Licença](#licença)

## O que é

Programming Wizard é uma aplicação **local-first** para estudar engenharia de software
com profundidade. O conteúdo cobre do primeiro programa em Java até sistemas
distribuídos, performance, arquitetura e preparação para entrevistas.

Não é um curso em vídeo nem uma plataforma multiusuário. É um ambiente pessoal de
estudo: o progresso, as notas, o código e as revisões ficam no seu PostgreSQL. A
aplicação não envia seus dados para nenhum serviço externo.

**Números do conteúdo atual:**

| Conteúdo | Quantidade |
|---|---:|
| Trilhas | 13 |
| Módulos | 70 |
| Aulas em markdown | 235 |
| Exercícios Java com JUnit 5 | 36 |
| Problemas externos curados | 147 |
| Capstones de portfólio | 13 |
| Desafios CodeCrafters mapeados | 12 |
| Stages de desafios | 425 |

## Destaques

- **Trilhas guiadas** — 13 trilhas com ementa, aulas, quizzes, takeaways e notas pessoais.
- **Exercícios Java** — editor com enunciado, dicas progressivas, testes JUnit 5 e solução comentada.
- **Revisão espaçada** — fila de revisão com intervalos e qualidade de resposta.
- **Dashboard e progresso** — sequência de dias, meta diária, timer, heatmap e plano semanal.
- **Capstones** — 13 projetos de portfólio com requisitos, stack e critérios de conclusão.
- **CodeCrafters local** — catálogo de 12 desafios (425 stages), starter repo, instruções,
  runner real, remote git local e hook de submissão. **HTTP Server**, **Git**,
  **DNS Server**, **Tokenizer**, **SQLite**, **Claude Code**, **BitTorrent**, **Kafka**,
  **grep** e **Shell** estão jogáveis de ponta a ponta.
- **Busca global** — `Ctrl+K` / `⌘K` para aulas, exercícios, problemas e projetos.
- **Backup** — exportação do progresso em JSON em **Configurações → Exportar backup**.

## Stack

- **Next.js 15.5** com App Router, React 19 e TypeScript
- **Tailwind CSS 3** + `lucide-react`
- **Prisma 6** + **PostgreSQL 16**
- **Redis 7** opcional para cache (a aplicação funciona sem ele)
- **Docker Compose** para Postgres e Redis com volumes persistentes
- **react-markdown** + `rehype-highlight` para o conteúdo
- **Java 21 + Maven** para os desafios CodeCrafters locais

## Requisitos

Obrigatórios para a plataforma:

- **Node.js 20+** (testado com Node 24)
- **npm**
- **Docker Desktop** em execução (ou um PostgreSQL 16 próprio)
- **Git**

Opcionais:

- **Java 21 + Maven** para rodar os desafios CodeCrafters localmente
- **Redis** para cache; sem ele a aplicação continua funcionando

> Se você já tem um PostgreSQL 16 próprio, pule o `npm run db:up`, ajuste a
> `DATABASE_URL` no `.env` e rode `npm run db:push && npm run seed`. O `docker compose`
> é apenas o caminho mais simples para o ambiente local.

> A plataforma não executa código Java no navegador. Os exercícios são feitos para você
> colar em um projeto Maven/Gradle e rodar no seu ambiente.

## Como rodar

### 1. Clone o repositório

```bash
git clone https://github.com/studymachinex/programming-wizard.git
cd programming-wizard
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Crie o arquivo de ambiente

```bash
cp .env.example .env
```

No **Windows PowerShell**:

```powershell
Copy-Item .env.example .env
```

Os valores padrão já apontam para o `docker-compose.yml` deste repositório.

### 4. Suba o banco e importe o conteúdo

```bash
npm run setup
```

Esse comando:

1. sobe PostgreSQL e Redis com `docker compose`;
2. espera alguns segundos pelo banco;
3. aplica o schema Prisma com `prisma db push`;
4. importa trilhas, aulas, exercícios, problemas e projetos com `npm run seed`.

Se a máquina for lenta e o `db push` não conectar, rode `npm run db:push` novamente.

### 5. Rode a aplicação

```bash
npm run dev
```

Abra <http://localhost:3000>.

### Passo a passo alternativo

```bash
npm run db:up      # docker compose up -d
npm run db:push    # prisma db push (também gera o Prisma Client)
npm run seed       # importa todo o conteúdo
npm run dev
```

### Build de produção

```bash
npm run build
npm run start
```

O build executa `prisma generate` antes do `next build`.

## Configuração

### Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---:|---|---|
| `DATABASE_URL` | sim | `postgresql://wizard:wizard@localhost:5434/programming_wizard?schema=public` | Conexão do Prisma com o PostgreSQL |
| `REDIS_URL` | não | `redis://localhost:6380` | Cache opcional; se indisponível, o app ignora |
| `NEXT_TELEMETRY_DISABLED` | não | `1` no `.env.example` | Desativa a telemetria anônima do Next.js |

### Portas

| Serviço | Porta no host |
|---|---:|
| Aplicação Next.js | `3000` |
| PostgreSQL | `5434` |
| Redis | `6380` |

As portas do banco e do cache são diferentes das padrão para não conflitar com
instalações locais. Se você mudar as portas no `docker-compose.yml`, atualize também o
`.env`.

### Dados e backups

O `docker-compose.yml` usa dois volumes nomeados:

- `pw-postgres-data` — progresso, notas, código, revisões e sessões de estudo;
- `pw-redis-data` — cache, que pode ser perdido sem impacto.

Para parar os containers preservando os dados:

```bash
npm run db:down
```

Para apagar tudo e começar de novo:

```bash
docker compose down -v
npm run setup
```

Para exportar o progresso, use **Configurações → Exportar backup** ou:

```bash
curl http://localhost:3000/api/export
```

O backup é somente exportação; ainda não há importação automática.

### Redis opcional

Se o Redis estiver fora do ar, a aplicação continua funcionando. O cliente foi
configurado para falhar silenciosamente e nunca derrubar uma requisição por causa do
cache.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | `prisma generate` + build de produção |
| `npm run start` | Servidor de produção |
| `npm run typecheck` | Verifica os tipos TypeScript sem gerar arquivos |
| `npm run db:up` | Sobe PostgreSQL e Redis |
| `npm run db:down` | Para os containers (preserva volumes) |
| `npm run db:push` | Aplica o schema Prisma e gera o client |
| `npm run db:studio` | Abre o Prisma Studio |
| `npm run seed` | Importa todo o conteúdo (idempotente) |
| `npm run setup` | Sobe banco, espera, aplica schema e semeia |
| `npm run validate:content` | Valida o conteúdo com Zod antes do seed |
| `npm run catalog:sync` | Ressincroniza o catálogo CodeCrafters a partir do site |
| `npm run challenge:http` | Compila e valida a referência dos 14 stages do HTTP Server |
| `npm run challenge:git` | Compila e valida a referência dos 7 stages do Git |
| `npm run challenge:dns` | Compila e valida a referência dos 8 stages do DNS Server |
| `npm run challenge:tokenizer` | Compila e valida a referência dos 8 stages do Tokenizer |
| `npm run challenge:sqlite` | Compila e valida a referência dos 9 stages do SQLite |
| `npm run challenge:claude-code` | Compila e valida a referência dos 18 stages do Claude Code |
| `npm run challenge:bittorrent` | Compila e valida a referência dos 19 stages do BitTorrent |
| `npm run challenge:kafka` | Compila e valida a referência dos 25 stages do Kafka |
| `npm run challenge:grep` | Compila e valida a referência dos 33 stages do grep |
| `npm run challenge:shell` | Compila e valida a referência dos 76 stages do Shell |
| `npm run cc -- <cmd>` | CLI dos desafios: `start`, `task`, `test`, `submit`, `status`, `list`, `reset` |

## Como usar a plataforma

1. **Dashboard** (`/`) — sequência de dias, meta diária, próxima aula, revisões e timer.
2. **Trilhas** (`/trilhas`) — ementa completa por módulo, com progresso por aula e exercício.
3. **Aula** (`/trilhas/<trilha>/aulas/<aula>`) — texto, código Java, quiz, takeaways, notas
   e botão de conclusão.
4. **Exercícios** (`/exercicios`) — editor Java com dicas, testes JUnit e solução de referência.
5. **Desafios externos** (`/desafios`) — 147 problemas curados por nível, com link direto e
   controle de resolvido.
6. **Projetos** (`/projetos`) — 13 capstones e o catálogo CodeCrafters.
7. **Revisão espaçada** (`/revisao`) — fila com intervalos e botões de qualidade.
8. **Progresso** (`/progresso`) — heatmap de atividade, minutos, aulas, exercícios e problemas.
9. **Plano** (`/plano`) — organização semanal do estudo.
10. **Configurações** (`/configuracoes`) — perfil, meta diária, backup e reset.

Atalho: **Ctrl+K** (ou **⌘K**) abre a busca global.

## Desafios CodeCrafters locais

A plataforma replica o fluxo “Build your own X” do
[CodeCrafters](https://app.codecrafters.io/catalog) sem depender do serviço externo:
starter repo, instruções por stage, runner de testes, remote git local e um hook que
confirma a conclusão no push.

**Jogáveis de ponta a ponta:** HTTP Server (14 stages), Git (7), DNS Server (8),
Tokenizer (8), SQLite (9), Claude Code (18), BitTorrent (19), Kafka (25), grep (33) e Shell (76). As
páginas ficam em `http://localhost:3000/projetos/codecrafters/<desafio>` (`http-server`,
`git`, `dns-server`, `tokenizer`, `sqlite`, `claude-code`, `bittorrent`, `kafka`, `grep`, `shell`)
e também pela aba Projetos. Os
próximos são integrados do desafio com menos stages para o com mais.

![Página do desafio HTTP Server](docs/screenshots/challenge.png)

### O fluxo

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

1. **Criar workspace** — copia o starter, inicializa o git e configura o remote `wizard`.
2. **Ler o stage** — instruções em markdown com objetivo, exemplo, critérios e dicas.
3. **Editar** `src/main/java/Main.java` no workspace.
4. **Testar** — `npm run cc -- test` compila e roda os 14 stages sem commitar.
5. **Submeter** — `npm run cc -- submit` faz commit, `git push wizard HEAD:master` e o hook
   `post-receive` compila o commit em um worktree temporário, roda os testes e grava o
   progresso.

### Comandos

```bash
npm run cc -- start http-server   # cria o workspace (ou: git, dns-server, tokenizer, sqlite, claude-code, bittorrent, kafka, grep, shell)
npm run cc -- task               # instruções do stage atual
npm run cc -- task --stage 4     # instruções de um stage específico
npm run cc -- test               # compila e testa, sem commitar
npm run cc -- submit             # commit + push + hook
npm run cc -- status             # checklist e último resultado
npm run cc -- list               # catálogo com progresso
npm run cc -- reset --yes        # zera o progresso (não apaga o código)
```

`test` e `submit` rodam todos os stages, mas o critério é o **stage atual**: stages
futuros ainda não implementados não contam como falha. `submit` avança o progresso até
o primeiro stage que falhar. `start --force` recria o workspace, zera o progresso e
recria o remote local.

Também é possível usar o git diretamente:

```bash
cd challenges/.workspaces/http-server-java
git push wizard master
```

O progresso fica em `challenges/.workspaces/.state/<desafio>.json`, que é ignorado pelo
git. O runner roda no seu host, com Java/Maven instalados; não há sandbox de container
nesta versão.

### Desafio Git

Um desafio de CLI: o seu programa é chamado como `git <comando>` e o tester confere cada
stage com o git real (`init`, `cat-file`, `hash-object`, `ls-tree`, `write-tree`,
`commit-tree` e `clone` via smart HTTP). O clone usa um servidor local com
`git http-backend`, sem internet. Código em [`challenges/git`](challenges/git) e
instruções em [`content/codecrafters/git`](content/codecrafters/git).

```bash
npm run cc -- start git
npm run challenge:git   # valida a referência
```

### Desafio DNS Server

Servidor UDP na porta 2053 que monta e interpreta pacotes DNS em binário: header com
flags, question, answer, compressão de nomes e, no último stage, forwarding para um
resolver. O tester sobe um resolver falso local, então roda offline. Código em
[`challenges/dns-server`](challenges/dns-server) e instruções em
[`content/codecrafters/dns-server`](content/codecrafters/dns-server).

```bash
npm run cc -- start dns-server
npm run challenge:dns   # valida a referência
```

### Desafio Tokenizer

Um tokenizer BPE do zero, sem rede: bytes UTF-8, contagem de pares, merges, treino,
encode/decode, a pré-tokenização com regex do GPT-2 e, no último stage, os mesmos token
IDs do GPT-2 a partir do `vocab.bpe` original (versionado em
[`challenges/tokenizer/data/gpt2`](challenges/tokenizer/data/gpt2), licença MIT da
OpenAI). Instruções em [`content/codecrafters/tokenizer`](content/codecrafters/tokenizer).

```bash
npm run cc -- start tokenizer
npm run challenge:tokenizer   # valida a referência
```

### Desafio SQLite

Leitura de arquivos `.db` do SQLite sem biblioteca: header, páginas de B-tree, registros,
schema, `SELECT`/`WHERE`, tabelas de milhares de páginas e busca por índice. O tester
gera bancos aleatórios com `node:sqlite` (**Node 22.13+**) e usa o próprio SQLite como
referência. Código em [`challenges/sqlite`](challenges/sqlite) e instruções em
[`content/codecrafters/sqlite`](content/codecrafters/sqlite).

```bash
npm run cc -- start sqlite
npm run challenge:sqlite   # valida a referência
```

### Desafio Claude Code

Um agente de código de linha de comando: API Chat Completions, tool calling, loop do
agente, ferramentas `read`/`write`/`bash`, skills (argumentos, composição, scripts,
subagentes) e um cliente LSP. Funciona com OpenAI, OpenRouter ou Ollama via
`OPENAI_BASE_URL`, `OPENAI_API_KEY` e `MODEL`; nos testes, um LLM falso e um language
server de brinquedo rodam localmente, **sem nenhuma API paga**. Código em
[`challenges/claude-code`](challenges/claude-code) e instruções em
[`content/codecrafters/claude-code`](content/codecrafters/claude-code).

```bash
npm run cc -- start claude-code
npm run challenge:claude-code   # valida a referência
```

### Desafio BitTorrent

Um cliente BitTorrent: bencode, `.torrent` e info hash, tracker HTTP, protocolo peer wire,
download de peças com verificação de hash e magnet links (BEP 9/10). O tester sobe um
tracker e peers locais que validam o protocolo — nada sai da máquina. Código em
[`challenges/bittorrent`](challenges/bittorrent) e instruções em
[`content/codecrafters/bittorrent`](content/codecrafters/bittorrent).

```bash
npm run cc -- start bittorrent
npm run challenge:bittorrent   # valida a referência
```

### Desafio Kafka

Um broker que fala o protocolo binário do Kafka: ApiVersions, DescribeTopicPartitions
(lendo o log de metadados KRaft), Fetch e Produce com record batches em disco. O broker
recebe um `server.properties` (`listeners`, `log.dirs`); o tester gera os logs e age como
cliente. Código em [`challenges/kafka`](challenges/kafka) e instruções em
[`content/codecrafters/kafka`](content/codecrafters/kafka).

```bash
npm run cc -- start kafka
npm run challenge:kafka   # valida a referência
```

### Desafio grep

Um `grep -E` com o seu próprio motor de expressões regulares (sem `java.util.regex`):
classes, âncoras, quantificadores com backtracking, alternação, grupos e backreferences,
além de `-o`, `--color`, busca em arquivos e `-r`. Código em
[`challenges/grep`](challenges/grep) e instruções em
[`content/codecrafters/grep`](content/codecrafters/grep).

```bash
npm run cc -- start grep
npm run challenge:grep   # valida a referência
```

### Desafio Shell

Um shell POSIX simplificado: REPL, builtins, execução de programas do `PATH`, quoting,
redirecionamento, pipelines, jobs em background, histórico (setas e arquivo), expansão de
variáveis e um editor de linha próprio com autocompletar de comandos, arquivos e completers
programáveis. O tester conversa com o shell por pipes (sem pseudo-terminal), mandando as
teclas como bytes, e usa programas auxiliares próprios — roda igual em Linux, macOS e
Windows. Código em [`challenges/shell`](challenges/shell) e instruções em
[`content/codecrafters/shell`](content/codecrafters/shell).

```bash
npm run cc -- start shell
npm run challenge:shell   # valida a referência
```

### Estrutura do desafio HTTP Server

- [`content/codecrafters/http-server/course.json`](content/codecrafters/http-server/course.json)
  — metadados e manifesto dos 14 stages.
- [`content/codecrafters/http-server/stages/`](content/codecrafters/http-server/stages)
  — instruções em markdown.
- [`challenges/http-server/starter/java`](challenges/http-server/starter/java) — starter repo.
- [`challenges/http-server/java`](challenges/http-server/java) — implementação de referência.
- [`challenges/engine`](challenges/engine) — CLI `cc`, workspace, evaluator e hook.
- [`docs/codecrafters/ROADMAP.md`](docs/codecrafters/ROADMAP.md) — status dos 12 desafios,
  ordem recomendada, tópicos e lacunas.
- [`content/codecrafters/catalog.json`](content/codecrafters/catalog.json) — catálogo público
  gerado com todos os stages.

Validar a implementação de referência:

```bash
npm run challenge:http
```

## Conteúdo e autoria

```text
content/
  tracks/
    <slug>/
      track.json          # manifesto: módulos, aulas, quiz, exercícios
      lessons/*.md        # uma aula por arquivo, markdown puro
      exercises/*.json    # exercícios Java + testes JUnit 5
  problems/
    <trilha>.json         # problemas externos curados
  projects.json           # capstones globais
  codecrafters/           # catálogo, cursos e instruções dos desafios
  AUTHORING.md            # guia de formato e qualidade
```

O seed é **idempotente** (upserts por slug): rode `npm run seed` quantas vezes quiser
depois de editar o conteúdo.

Validação antes de semear:

```bash
npm run validate:content
```

O validador confere schemas Zod, slugs únicos, arquivos referenciados, presença de Java,
tamanho mínimo das aulas e consistência entre manifesto e arquivos.

Detalhes de formato, tom e critérios de qualidade estão em
[`content/AUTHORING.md`](content/AUTHORING.md).

## Estrutura do projeto

```text
app/                 rotas do App Router e server actions
  api/search/        busca global
  api/export/        backup JSON do progresso
  projetos/          capstones e páginas CodeCrafters
components/          UI (aulas, exercícios, quiz, notas, timer, heatmap...)
content/             trilhas, aulas, exercícios, problemas, capstones e CodeCrafters
challenges/          starters, referências e engine dos desafios
  engine/            CLI cc, workspace git, evaluator e hook post-receive
  http-server/       starter/java, java (referência) e tests/
docs/                roadmap, guias e screenshots
lib/                 Prisma, Redis, schemas Zod, utilidades e agregações
prisma/              schema.prisma e seed.ts
scripts/             validate-content.ts e sync-codecrafters-catalog.mjs
docker-compose.yml   PostgreSQL 16 + Redis 7 com volumes
```

## API interna

- `GET /api/search?q=termo` — busca a partir de 2 caracteres; devolve trilhas, aulas,
  exercícios, problemas e projetos.
- `GET /api/export` — backup completo do perfil local em JSON.

## Desenvolvimento

Antes de abrir um pull request, rode:

```bash
npm run typecheck
npm run validate:content
npm run build
```

Para inspecionar o banco:

```bash
npm run db:studio
```

Para atualizar o catálogo público do CodeCrafters:

```bash
npm run catalog:sync
```

O catálogo é salvo em `content/codecrafters/catalog.json` e usado pela UI.

## Solução de problemas

**Porta em uso (3000, 5434 ou 6380).** Pare o processo conflitante ou ajuste as portas no
`docker-compose.yml` e no `.env` (lembre de atualizar `DATABASE_URL` e `REDIS_URL`).

**`prisma db push` não conecta.** Confirme `docker ps` e espere o healthcheck do Postgres
ficar `healthy`. O `npm run setup` espera 12 segundos; em máquinas lentas, rode
`npm run db:push` novamente.

**`EPERM ... query_engine-windows.dll.node` no Windows.** O servidor Next em execução
mantém a DLL do Prisma aberta. Pare `npm run dev`/`npm run start`, rode `npm run db:push`
(ou `npm run setup`) e suba o app de novo.

**Tipos antigos de rota no `.next`.** Se você renomeou pastas de rota, limpe o cache antes
do build:

```powershell
Remove-Item -Recurse -Force .next
npm run build
```

**Quero zerar o progresso sem perder o conteúdo.** Use **Configurações → Resetar
progresso**. Para apagar também o banco e reimportar tudo: `docker compose down -v` e
`npm run setup`.

**Redis fora do ar.** O app continua funcionando; o cache é opcional e falha
silenciosamente.

**O desafio HTTP Server não compila.** Confirme `java -version` (Java 21) e
`mvn -version`. O runner usa `mvn -q -B package` no workspace.

**O push do desafio foi rejeitado.** Rode `npm run cc -- start http-server --force` para
recriar workspace, progresso e remote local do zero, ou faça um `git pull` no workspace.

## Limitações conhecidas

- Perfil único local (`Profile.id = "local"`), sem autenticação e sem multiusuário.
- Os testes dos desafios CodeCrafters rodam no seu host (Java/Maven), não em um sandbox
  de container.
- HTTP Server, Git, DNS Server, Tokenizer, SQLite, Claude Code, BitTorrent, Kafka, grep e Shell estão jogáveis; os outros 2 desafios estão no catálogo e no roadmap.
- O progresso dos desafios fica em JSON local (`challenges/.workspaces/.state/`), não no
  PostgreSQL.
- Os links de problemas externos exigem internet.
- O backup JSON é somente exportação; não há importação nesta versão.
- O conteúdo educacional é em português.

## Contribuindo

Contribuições são bem-vindas: correções de conteúdo, novos exercícios, melhorias de UI,
novos desafios e documentação. Leia [`CONTRIBUTING.md`](CONTRIBUTING.md) antes de abrir um
pull request.

Para mudanças de conteúdo, o guia de formato e qualidade está em
[`content/AUTHORING.md`](content/AUTHORING.md).

## Licença

Distribuído sob a licença **MIT**. Veja [`LICENSE`](LICENSE).

O projeto é independente e não é afiliado ao CodeCrafters. O catálogo público é usado
como referência de estudo; as instruções locais foram escritas para esta plataforma.
