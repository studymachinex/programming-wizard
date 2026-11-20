# Build your own SQLite — Java

Este é o repositório inicial do desafio **SQLite** do Programming Wizard.

Você vai ler arquivos `.db` do SQLite **sem biblioteca nenhuma**: o header, as páginas de
B-tree, os registros, e por fim consultas que usam índices.

O programa fica em `src/main/java/Main.java` e recebe o caminho do banco e um comando:

```bash
./your_program.sh exemplo.db .dbinfo
./your_program.sh exemplo.db .tables
./your_program.sh exemplo.db "SELECT COUNT(*) FROM apples"
./your_program.sh exemplo.db "SELECT name, color FROM apples WHERE color = 'Yellow'"
```

## Comandos

Na raiz do Programming Wizard:

```bash
npm run cc -- task          # instruções do stage atual
npm run cc -- test          # roda os testes sem commitar
npm run cc -- submit        # commit + push; o hook do remote roda os testes
npm run cc -- status        # progresso
```

O tester gera bancos aleatórios com o SQLite embutido no Node (`node:sqlite`, Node
22.13+). Para criar bancos à mão, use o `sqlite3` se tiver, ou:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('exemplo.db');db.exec(\"CREATE TABLE apples (id integer primary key, name text, color text); INSERT INTO apples (name, color) VALUES ('Fuji','Red'),('Golden','Yellow')\")"
```

## Estrutura

- `your_program.sh` / `your_program.cmd` — compila e executa o programa.
- `src/main/java/Main.java` — seu código.

A referência do formato é a documentação oficial:
<https://www.sqlite.org/fileformat.html>.
