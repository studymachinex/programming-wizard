Suporte várias colunas no `SELECT`, separadas por `|` na saída:

```bash
$ ./your_program.sh exemplo.db "SELECT name, color FROM apples"
Gala|Red
Pink Lady|Pink
Verde Limão|Green
Golden|Yellow
```

## O que você vai aprender

- a fazer uma **projeção**: escolher e reordenar colunas de cada registro;
- o formato de saída padrão do `sqlite3`.

## O que fazer

1. Separe a lista de colunas do `SELECT` por vírgula e tire os espaços.
2. Converta cada nome no índice da coluna (stage 5).
3. Para cada linha, junte os valores nessa ordem com `|`.

## Como o tester valida

- roda `SELECT name, color FROM apples` e `SELECT color, name FROM apples`;
- compara com o resultado do SQLite real (em qualquer ordem de linhas).

## Dicas

- A ordem das colunas na saída é a do `SELECT`, não a da tabela.
- Inteiros saem como números (`42`), texto sai sem aspas.

## Critério de conclusão

`SELECT a, b FROM <tabela>` imprime `a|b` para cada linha.
