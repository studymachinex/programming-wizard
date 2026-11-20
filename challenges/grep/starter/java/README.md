# Build your own grep — Java

Este é o repositório inicial do desafio **grep** do Programming Wizard.

Você vai construir um `grep -E` com o **seu próprio motor de expressões regulares**:
classes de caracteres, âncoras, quantificadores, alternação, grupos e backreferences, além
das opções `-o`, `--color`, busca em arquivos e `-r`.

```bash
echo "sally has 3 apples" | ./your_program.sh -E "\d apples"
./your_program.sh -o --color=always -E "\d+" notas.txt
./your_program.sh -r -E "TODO" src/
```

- Código de saída: **0** se alguma linha casou, **1** se nenhuma casou.
- **Regra do desafio:** nada de `java.util.regex` (o tester recusa o código). `String.matches`,
  `replaceAll` e `split` com regex também usam o motor do Java — evite.

## Comandos

Na raiz do Programming Wizard:

```bash
npm run cc -- task          # instruções do stage atual
npm run cc -- test          # roda os testes sem commitar
npm run cc -- submit        # commit + push; o hook do remote roda os testes
npm run cc -- status        # progresso
```

## Estrutura

- `your_program.sh` / `your_program.cmd` — compila e executa o grep.
- `src/main/java/Main.java` — seu código.
