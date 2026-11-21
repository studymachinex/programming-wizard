`jobs` mostra cada job com número, marcador, estado e comando.

## O que você vai aprender

- formatação de saída em colunas.

## O que fazer

Guarde, para cada job, o número, o texto do comando (a linha sem o `&`) e o processo.
Rodando: estado `Running` e o comando seguido de ` &`.

## Como o tester valida

- `sleep 20 &` e `jobs` → `[1]+  Running                 sleep 20 &`.

## Dicas

- Formato de uma linha de `jobs`: `[N]M  ESTADO COMANDO`, onde `M` é `+` (job mais recente), `-` (o anterior) ou espaço, e `ESTADO` é `Running` ou `Done` alinhado à esquerda em 24 colunas. Em Java: `String.format("[%d]%c  %-24s%s", n, m, estado, comando)`.

## Critério de conclusão

`jobs` lista um job.
