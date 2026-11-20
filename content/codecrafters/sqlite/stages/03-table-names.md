Implemente `.tables`: imprima o nome de cada tabela, separados por espaço.

```bash
$ ./your_program.sh exemplo.db .tables
apples oranges grapes
```

Para isso você precisa ler o **conteúdo** das células da página 1, não só contá-las.

## O que você vai aprender

- o formato de **varint** do SQLite;
- o formato de **registro**: um header com os tipos e um corpo com os valores;
- as colunas da `sqlite_schema`.

## Células de folha de tabela

Logo depois do header da página vem o **array de ponteiros de células**: 2 bytes por
célula, cada um com o offset da célula dentro da página. Uma célula de folha de tabela é:

```text
tamanho do payload (varint) | rowid (varint) | payload (o registro)
```

### Varint

Inteiro de 1 a 9 bytes, big-endian. Nos 8 primeiros bytes, o bit alto diz "continua" e
os 7 bits baixos são dados; o 9º byte, se existir, contribui com os 8 bits.

```java
long value = 0;
for (int i = 0; i < 8; i++) {
  int b = data[offset + i] & 0xff;
  value = (value << 7) | (b & 0x7f);
  if ((b & 0x80) == 0) return /* value, i + 1 bytes lidos */;
}
value = (value << 8) | (data[offset + 8] & 0xff); // 9 bytes
```

### Registro

```text
tamanho do header (varint) | serial type 1 | serial type 2 | ... | valor 1 | valor 2 | ...
```

O tamanho do header **inclui** o próprio varint. Cada *serial type* diz o tipo e o
tamanho do valor correspondente:

| Serial type | Valor |
|---|---|
| 0 | NULL |
| 1, 2, 3, 4, 5, 6 | inteiro de 1, 2, 3, 4, 6 ou 8 bytes, com sinal |
| 7 | float de 8 bytes |
| 8, 9 | as constantes 0 e 1 |
| N ≥ 12, par | BLOB de (N − 12) / 2 bytes |
| N ≥ 13, ímpar | texto de (N − 13) / 2 bytes |

## As colunas da `sqlite_schema`

`type`, `name`, `tbl_name`, `rootpage`, `sql` — nessa ordem.

## O que fazer

1. Para cada célula da página 1, leia o registro.
2. Fique com as linhas em que `type` é `table` e o nome **não** começa com `sqlite_`.
3. Imprima os nomes separados por espaço.

## Como o tester valida

- cria um banco com 3 a 6 tabelas;
- compara os nomes impressos com os esperados, em qualquer ordem.

## Dicas

- Monte uma função `readRecord(page, offset)` que devolve uma `List<Object>`: ela é o
  coração dos próximos stages.
- Volte ao stage 2 e conte só `type = 'table'`: assim o `.dbinfo` fica certo também em
  bancos com índices.

## Critério de conclusão

`.tables` lista todas as tabelas do usuário.
