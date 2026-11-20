Filtre as linhas com `WHERE`:

```bash
$ ./your_program.sh exemplo.db "SELECT name, color FROM apples WHERE color = 'Yellow'"
Golden|Yellow
```

## O que você vai aprender

- a diferença entre **filtrar** (WHERE, escolhe linhas) e **projetar** (SELECT, escolhe
  colunas);
- que, sem índice, filtrar exige ler todas as linhas.

## O que fazer

1. Reconheça `WHERE <coluna> = '<valor>'` no fim da consulta.
2. Para cada linha, compare o valor da coluna com o literal.
3. Imprima só as linhas que passam no filtro.

## Como o tester valida

- escolhe uma cor que existe na tabela e roda o `SELECT ... WHERE color = '<cor>'`;
- roda também um filtro que não casa com nada e espera saída vazia;
- compara com o resultado do SQLite real.

## Dicas

- Só é preciso suportar igualdade com texto entre aspas simples.
- A coluna do `WHERE` pode não estar no `SELECT`: filtre com o registro completo,
  antes da projeção.

## Critério de conclusão

O `WHERE` devolve exatamente as linhas que o SQLite devolve.
