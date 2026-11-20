Agora leia os **valores** de uma coluna:

```bash
$ ./your_program.sh exemplo.db "SELECT name FROM apples"
Gala
Pink Lady
Verde Limão
Golden
```

## O que você vai aprender

- que o registro não tem nomes de colunas — só valores, na ordem da declaração;
- a descobrir essa ordem lendo o `CREATE TABLE` guardado no schema;
- a ler todas as linhas de uma página folha.

## O que fazer

1. No schema, pegue a coluna `sql` da tabela, por exemplo:
   `CREATE TABLE apples (id integer primary key, name text, color text)`.
2. Extraia os nomes das colunas: o texto entre os parênteses, separado por vírgulas; a
   primeira palavra de cada definição é o nome.
3. Ache o índice da coluna pedida.
4. Para cada célula da página raiz da tabela, leia o registro e imprima o valor nesse
   índice, um por linha.

## Como o tester valida

- cria um banco com duas tabelas pequenas;
- roda `SELECT name FROM apples` e `SELECT color FROM grapes`;
- compara as linhas com o resultado do SQLite real (em qualquer ordem).

## Dicas

- Use o primeiro `(` e o **último** `)` do `CREATE TABLE`: tipos como `varchar(20)`
  também têm parênteses.
- Imprima `NULL` como linha vazia.
- Separe "achar a tabela", "listar colunas" e "ler linhas" em funções: o resto do desafio
  combina as três.

## Critério de conclusão

`SELECT <coluna> FROM <tabela>` imprime os valores dessa coluna.
