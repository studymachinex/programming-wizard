# Build your own HTTP server — Java

Este é o repositório inicial do desafio **HTTP Server** do Programming Wizard.

O programa fica em `src/main/java/Main.java`. O runner executa `./your_program.sh` (ou
`your_program.cmd` no Windows) e conversa com o servidor via TCP na porta `4221`.

## Comandos

Na raiz do Programming Wizard:

```bash
npm run cc -- task          # instruções do stage atual
npm run cc -- test          # roda os testes sem commitar
npm run cc -- submit        # commit + push; o hook do remote roda os testes
npm run cc -- status        # progresso
```

O `submit` empurra para o remote local `wizard`. O hook `post-receive` desse remote é o
equivalente ao test runner server-side do CodeCrafters: ele compila o commit, roda os
stages e grava o resultado.

## Estrutura

- `codecrafters.yml` — linguagem/versão usada pelo runner.
- `.codecrafters/compile.sh` e `.codecrafters/run.sh` — convenções de build/execução.
- `your_program.sh` / `your_program.cmd` — como o tester inicia o seu programa.
- `src/main/java/Main.java` — seu código.

Não é necessário editar `pom.xml` para os stages deste desafio.
