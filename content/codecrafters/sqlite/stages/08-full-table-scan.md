Até aqui as tabelas cabiam em uma página. Agora elas têm milhares de linhas e a página
raiz é uma página **interna**: você precisa percorrer a B-tree inteira.

```bash
$ ./your_program.sh grande.db "SELECT COUNT(*) FROM spells"
3412
$ ./your_program.sh grande.db "SELECT id, name, level FROM spells WHERE school = 'Illusion'"
4|crystal rune sage 3|7
...
```

## O que você vai aprender

- a estrutura de uma B-tree de tabela: páginas internas apontam para filhas, folhas
  guardam as linhas;
- a percorrer a árvore de forma recursiva;
- o alias de `rowid`: `INTEGER PRIMARY KEY`.

## Páginas internas de tabela (tipo `0x05`)

O header tem 12 bytes; os bytes 8–11 são o número da **filha mais à direita**. Cada
célula é:

```text
número da página filha à esquerda (4 bytes) | rowid (varint)
```

A filha à esquerda contém as linhas com rowid ≤ ao da célula. Para ler a tabela inteira,
visite as filhas de todas as células, em ordem, e por último a filha mais à direita.

```java
void scan(int pageNumber, List<Row> out) {
  // tipo 0x0d: leia as células como linhas
  // tipo 0x05: para cada célula, scan(filhaEsquerda); depois scan(filhaDaDireita)
}
```

## `INTEGER PRIMARY KEY`

Uma coluna declarada como `id integer primary key` **é** o rowid. O SQLite não a repete
no registro: no lugar dela o registro guarda `NULL`. Ao imprimir essa coluna, use o
rowid da célula.

## O que fazer

1. Troque a leitura de uma única folha por uma travessia da B-tree.
2. Faça o `COUNT(*)` funcionar em tabelas de várias páginas.
3. Trate a coluna `INTEGER PRIMARY KEY` como o rowid.

## Como o tester valida

- cria uma tabela com 2.500 a 4.000 linhas em páginas de 1024 bytes;
- o `CREATE TABLE` vem formatado em várias linhas, com tabs;
- roda `SELECT COUNT(*) FROM spells` e um `SELECT id, name, level ... WHERE school = '...'`;
- compara com o SQLite real.

## Dicas

- Se o seu parser de colunas usa `split(" ")`, quebras de linha e tabs vão quebrá-lo:
  use `\s+`.
- Para contar linhas não é preciso decodificar registros: some as células das folhas.
- Linhas grandes podem transbordar para *overflow pages*; os bancos do tester não têm
  isso, então você pode ignorar esse caso.

## Critério de conclusão

As consultas funcionam em tabelas de qualquer tamanho.
