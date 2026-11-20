Uma linha pode ter **várias ocorrências**. Com `-o`, cada uma sai em uma linha.

## O que você vai aprender

- a buscar ocorrências **sem sobreposição**, da esquerda para a direita.

## O que fazer

Depois de achar um match em `[início, fim)`, continue a busca a partir de `fim`. Ignore
matches vazios (se o match for vazio, avance uma posição).

## Como o tester valida

- `\d+` contra `a86b395c3` → `86`, `395`, `3`, um por linha.

## Dicas

- `\d+` é guloso: `395` sai inteiro, não `3`, `9`, `5`.

## Critério de conclusão

`-o` imprime todas as ocorrências.
