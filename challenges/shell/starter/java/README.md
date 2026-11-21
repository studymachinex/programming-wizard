# Build your own Shell — Java

Este é o repositório inicial do desafio **Shell** do Programming Wizard.

Você vai construir um shell POSIX simplificado: REPL, builtins (`echo`, `type`, `cd`, `pwd`,
`history`, `jobs`, `complete`, `declare`), execução de programas do `PATH`, quoting,
redirecionamento, pipelines, jobs em background, histórico com setas e persistência, expansão de
variáveis e um editor de linha próprio com autocompletar.

```
$ echo "olá   mundo" > saida.txt
$ cat saida.txt | wc
      1       2      13
$ sleep 5 &
[1] 4242
$ ech<TAB>
```

## Como o tester conversa com o shell

Não há terminal no meio: o tester escreve no stdin os bytes exatamente como seriam digitados
(Tab = `\t`, seta ↑ = `ESC [ A`) e lê stdout e stderr mesclados, interpretando a saída como um
terminal. A partir do stage 23 o shell lê tecla a tecla e **ecoa** o que é digitado. Rodando à
mão num terminal comum você verá o texto duplicado — é esperado; use `npm run cc -- test`.

Os programas externos dos testes (`cat`, `ls`, `head`, `wc`, `sleep`, ...) são criados pelo
tester, então os testes rodam igual em Linux, macOS e Windows.

## Comandos

Na raiz do Programming Wizard:

```bash
npm run cc -- task          # instruções do stage atual
npm run cc -- test          # roda os testes sem commitar
npm run cc -- submit        # commit + push; o hook do remote roda os testes
npm run cc -- status        # progresso
```

## Estrutura

- `your_program.sh` / `your_program.cmd` — compila e executa o shell.
- `src/main/java/Main.java` — seu código.
