Com vários jobs, `+` marca o mais recente e `-` o anterior; os demais ficam com espaço.

## O que você vai aprender

- como o shell decide o "job atual".

## O que fazer

Ordene a listagem pelo número do job; calcule os marcadores pela ordem de início.

## Como o tester valida

- três jobs: `[1]   Running ...`, `[2]-  Running ...`, `[3]+  Running ...`.

## Dicas

- Formato de uma linha de `jobs`: `[N]M  ESTADO COMANDO`, onde `M` é `+` (job mais recente), `-` (o anterior) ou espaço, e `ESTADO` é `Running` ou `Done` alinhado à esquerda em 24 colunas. Em Java: `String.format("[%d]%c  %-24s%s", n, m, estado, comando)`.

## Critério de conclusão

Os marcadores estão certos.
