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
| DNS Server | 8 | ⬜ em breve | ⬜ |
| SQLite | 9 | ⬜ em breve | ⬜ |
| Tokenizer | 8 | ⬜ em breve | ⬜ |
| BitTorrent | 19 | ⬜ em breve | ⬜ |
| Kafka | 25 | ⬜ em breve | ⬜ |
| grep | 33 | ⬜ em breve | ⬜ |
| Shell | 76 | ⬜ em breve | ⬜ |
| Interpreter | 84 | ⬜ em breve | ⬜ |
| Claude Code | 18 | ⬜ em breve | ⬜ |

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

## Próximos desafios

A integração segue do desafio com menos stages para o com mais: DNS Server (8),
Tokenizer (8), SQLite (9), Claude Code (18), BitTorrent (19) e assim por diante.


Para adicionar um desafio, o contrato é:

1. `content/codecrafters/<slug>/course.json` com metadados, `runtime` e stages.
2. `content/codecrafters/<slug>/stages/*.md` com as instruções.
3. `challenges/<slug>/starter/<linguagem>` com o repo inicial.
4. `challenges/<slug>/tests/stages.mjs` exportando `runStages({ workspaceDir, build })`.
5. O `runtime.runner` do curso aponta para esse módulo.

O engine, o hook e a UI funcionam sem mudança para qualquer desafio que cumpra esse
contrato.
