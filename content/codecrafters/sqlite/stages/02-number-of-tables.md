Estenda o `.dbinfo` para imprimir também quantas tabelas o banco tem:

```bash
$ ./your_program.sh exemplo.db .dbinfo
database page size: 4096
number of tables: 3
```

## O que você vai aprender

- que o SQLite guarda o próprio schema em uma tabela especial, a `sqlite_schema`;
- o formato do header de uma página de **B-tree**;
- a diferença entre páginas folha e páginas internas.

## O schema

A **página 1** é a raiz da tabela `sqlite_schema`, que tem uma linha para cada tabela,
índice, view e trigger do banco. A página 1 é especial: os primeiros 100 bytes dela são
o header do banco, então o conteúdo da B-tree começa no **offset 100**.

## O header da página de B-tree

| Offset | Tamanho | Campo |
|---:|---:|---|
| 0 | 1 | tipo: `0x0d` folha de tabela, `0x05` interna de tabela, `0x0a` folha de índice, `0x02` interna de índice |
| 1 | 2 | início do primeiro bloco livre |
| 3 | 2 | **número de células** na página |
| 5 | 2 | início da área de conteúdo das células |
| 7 | 1 | bytes fragmentados |
| 8 | 4 | ponteiro para a página filha mais à direita (só em páginas internas) |

O header tem 8 bytes em folhas e 12 em páginas internas.

## O que fazer

1. Leia a página 1 inteira.
2. Pule os 100 bytes do header do banco.
3. Leia o número de células (offset 3, 2 bytes).
4. Imprima `number of tables: <n>` depois da linha do tamanho de página.

```java
int cells = ((page[100 + 3] & 0xff) << 8) | (page[100 + 4] & 0xff);
```

## Como o tester valida

- cria bancos com 2 a 6 tabelas (sem índices);
- roda `.dbinfo` e procura a linha `number of tables: <n>`.

## Dicas

- Nos bancos deste stage, cada célula da página 1 é uma tabela. Em bancos com índices,
  o certo é contar só as linhas com `type = 'table'` — você vai saber ler o `type` no
  próximo stage.
- Guarde uma função `readPage(n)`: ela volta em todos os stages.

## Critério de conclusão

`.dbinfo` imprime o número de tabelas do banco.
