Sua primeira consulta SQL:

```bash
$ ./your_program.sh exemplo.db "SELECT COUNT(*) FROM apples"
4
```

## O que você vai aprender

- que cada tabela é uma B-tree própria, começando em uma **página raiz**;
- como o schema aponta para essa página (`rootpage`);
- que, em uma folha, cada célula é uma linha.

## O que fazer

1. Reconheça o formato `SELECT COUNT(*) FROM <tabela>` (sem diferenciar maiúsculas).
2. No schema, encontre a linha da tabela e leia `rootpage` (4ª coluna).
3. Leia essa página e imprima o número de células (offset 3 do header).

Atenção: nas páginas que **não** são a página 1, o header da B-tree começa no offset 0.

## Como o tester valida

- cria um banco com duas tabelas pequenas (cabem em uma página);
- roda `SELECT COUNT(*)` para cada uma e compara com a contagem real.

## Dicas

- Uma regex simples resolve o SQL deste desafio, por exemplo
  `select\s+(.+?)\s+from\s+(\w+)(?:\s+where\s+(\w+)\s*=\s*'([^']*)')?` com
  `CASE_INSENSITIVE`.
- Neste stage as tabelas cabem em uma folha. No stage 8 elas vão ocupar várias páginas.

## Critério de conclusão

`SELECT COUNT(*) FROM <tabela>` imprime o número de linhas.
