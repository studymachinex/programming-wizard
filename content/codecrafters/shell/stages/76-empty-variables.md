Uma variável vazia (ou inexistente) expande para nada. Se a palavra inteira ficou vazia
**e não tinha aspas**, ela simplesmente não existe — não vira um argumento vazio. Entre aspas,
`"$vazio"` continua sendo um argumento (vazio).

## O que você vai aprender

- a diferença entre "palavra vazia" e "nenhuma palavra", fundamental em scripts de shell.

## O que fazer

Ao terminar uma palavra, descarte-a se estiver vazia e não tiver tido nenhuma aspa ou escape.

## Como o tester valida

- `echo a $NAO_EXISTE b` → `a b`;
- `declare vazio=` e `echo [$vazio]` → `[]`;
- `show_args x $vazio y` → 2 argumentos;
- `show_args x "$vazio" y` → 3 argumentos, o do meio vazio.

## Dicas

- Parabéns: com isso o seu shell tem REPL, quoting, redirecionamento, pipelines, jobs, histórico persistente, variáveis e completação programável.

## Critério de conclusão

Variáveis vazias se comportam como no sh — o shell está completo.
