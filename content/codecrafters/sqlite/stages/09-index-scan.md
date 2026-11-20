Varrer a tabela inteira para achar 6 linhas em 6.000 é desperdício. Quando existe um
**índice** na coluna do `WHERE`, use-o:

```bash
$ ./your_program.sh empresas.db "SELECT id, name FROM companies WHERE country = 'tuvalu'"
1834|frost rune labs 1834
4410|lunar ember labs 4410
...
```

## O que você vai aprender

- o que é um índice: outra B-tree, ordenada pela coluna indexada;
- a **descer** por uma B-tree (busca) em vez de percorrê-la inteira (varredura);
- a buscar uma linha pelo rowid em O(log n) páginas.

## Como achar o índice

O schema tem uma linha com `type = 'index'` para cada índice:

```sql
CREATE INDEX idx_companies_country
	on companies (country)
```

Se `tbl_name` é a tabela da consulta e a coluna entre parênteses é a do `WHERE`, use
esse índice (`rootpage` aponta para a raiz dele).

## B-tree de índice

- **Folha** (`0x0a`): cada célula é `tamanho do payload (varint) | registro`.
- **Interna** (`0x02`): cada célula é `filha à esquerda (4 bytes) | tamanho do payload (varint) | registro`.

O registro do índice tem as colunas indexadas seguidas do **rowid**: aqui,
`[country, rowid]`. As entradas estão ordenadas por `country` (comparação de bytes) e
depois por rowid.

Diferente da tabela, **células internas do índice também são entradas**: uma chave
pode estar só em uma página interna.

### Buscando todas as entradas iguais a `X`

Em uma página interna, para cada célula com chave `K`:

- se `X < K`: visite a filha à esquerda e **pare** (o resto é maior);
- se `X == K`: visite a filha à esquerda, guarde o rowid da célula e continue;
- se `X > K`: continue para a próxima célula.

Se não parou, visite a filha mais à direita. Em uma folha, colete as entradas iguais a
`X` e pare na primeira maior.

## Buscando a linha pelo rowid

Com os rowids em mãos, desça pela B-tree da **tabela**: em cada página interna, vá para a
filha à esquerda da primeira célula cuja chave é ≥ rowid (ou para a filha mais à direita
se nenhuma for). Na folha, procure a célula com aquele rowid.

## Como o tester valida

- cria uma tabela `companies` com 5.000 a 7.000 linhas e um índice em `country`;
- escolhe um país que aparece em poucas linhas;
- **zera todas as páginas folha da tabela que não têm nenhuma dessas linhas** — uma
  varredura completa lê páginas vazias e falha; a busca pelo índice só toca páginas
  intactas;
- compara o resultado com o do SQLite real (obtido antes de zerar as páginas).

## Dicas

- Compare textos como bytes UTF-8 sem sinal (`Arrays.compareUnsigned`): é a ordem
  `BINARY` do SQLite.
- Mantenha o caminho de varredura para consultas sem índice: o stage 8 continua sendo
  testado.
- O rowid é o **último** valor do registro do índice.

## Critério de conclusão

Consultas com `WHERE` em coluna indexada usam o índice e leem só as páginas necessárias.
