# Build your own Interpreter — Java

Este é o repositório inicial do desafio **Interpreter** do Programming Wizard.

Você vai construir um interpretador *tree-walk* para **Lox**, a linguagem criada por Robert
Nystrom no livro [Crafting Interpreters](https://craftinginterpreters.com): scanner, parser,
avaliação de expressões, variáveis e escopos, controle de fluxo, funções e closures, resolução
estática, classes e herança.

```bash
./your_program.sh tokenize programa.lox   # lista os tokens
./your_program.sh parse    programa.lox   # árvore de uma expressão
./your_program.sh evaluate programa.lox   # valor de uma expressão
./your_program.sh run      programa.lox   # executa o programa
```

Códigos de saída: **65** para erros léxicos, de sintaxe ou de resolução; **70** para erros de
execução.

## Comandos

Na raiz do Programming Wizard:

```bash
npm run cc -- task          # instruções do stage atual
npm run cc -- test          # roda os testes sem commitar
npm run cc -- submit        # commit + push; o hook do remote roda os testes
npm run cc -- status        # progresso
```

## Estrutura

- `your_program.sh` / `your_program.cmd` — compila e executa o interpretador.
- `src/main/java/Main.java` — seu código (crie as classes que quiser).
