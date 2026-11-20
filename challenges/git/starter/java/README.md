# Build your own Git — Java

Este é o repositório inicial do desafio **Git** do Programming Wizard.

O programa fica em `src/main/java/Main.java` e se comporta como o comando `git`: o
primeiro argumento é o subcomando (`init`, `cat-file`, `hash-object`...) e o diretório
atual é o repositório. O tester roda o seu programa em pastas temporárias e confere o
resultado com o git de verdade.

## Comandos

Na raiz do Programming Wizard:

```bash
npm run cc -- task          # instruções do stage atual
npm run cc -- test          # roda os testes sem commitar
npm run cc -- submit        # commit + push; o hook do remote roda os testes
npm run cc -- status        # progresso
```

Para experimentar à mão, rode em uma pasta vazia **fora** deste workspace (senão você
sobrescreve o `.git` dele):

```bash
mkdir /tmp/teste && cd /tmp/teste
<caminho-do-workspace>/your_program.sh init
```

## Estrutura

- `your_program.sh` / `your_program.cmd` — compila e executa o seu git no diretório atual.
- `src/main/java/Main.java` — seu código.

Só a biblioteca padrão do Java é necessária: `java.util.zip` (zlib),
`java.security.MessageDigest` (SHA-1) e `java.net.http` (clone).
