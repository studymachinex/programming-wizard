Um banco SQLite é **um único arquivo**. Neste desafio você vai lê-lo byte a byte, sem
biblioteca nenhuma. O programa recebe o caminho do banco e um comando:

```bash
$ ./your_program.sh exemplo.db .dbinfo
database page size: 4096
```

## O que você vai aprender

- que o arquivo é dividido em **páginas** de tamanho fixo;
- o papel do header de 100 bytes no início do arquivo;
- a ler inteiros big-endian a partir de bytes.

## O formato

Os primeiros 100 bytes do arquivo são o **header do banco**. Alguns campos:

| Offset | Tamanho | Campo |
|---:|---:|---|
| 0 | 16 | a string `"SQLite format 3\0"` |
| 16 | 2 | tamanho da página em bytes (big-endian) |
| 56 | 4 | encoding do texto (1 = UTF-8) |

O tamanho da página é uma potência de 2 entre 512 e 32768. O valor `1` é um caso
especial que significa **65536** (não cabe em 2 bytes).

## O que fazer

1. Abra o arquivo e leia os 100 primeiros bytes.
2. Leia os bytes 16 e 17 como um inteiro big-endian de 16 bits.
3. Imprima `database page size: <tamanho>`.

O starter já traz esse código comentado:

```java
int pageSize = ((header[16] & 0xff) << 8) | (header[17] & 0xff);
OUT.println("database page size: " + pageSize);
```

## Como o tester valida

- cria bancos com tamanhos de página diferentes (1024 a 16384);
- roda `.dbinfo` e procura a linha `database page size: <n>`.

## Dicas

- `RandomAccessFile` permite ler qualquer parte do arquivo com `seek()`: você vai usá-lo
  para buscar páginas nos próximos stages.
- A página *n* começa no offset `(n - 1) * pageSize`; as páginas são numeradas a partir de 1.
- A documentação oficial do formato é ótima: <https://www.sqlite.org/fileformat.html>.

## Critério de conclusão

`.dbinfo` imprime o tamanho de página correto.
