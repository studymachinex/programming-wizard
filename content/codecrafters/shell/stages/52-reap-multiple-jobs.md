Vários jobs podem terminar entre duas listagens.

## O que você vai aprender

- a remover vários itens de uma lista com segurança.

## O que fazer

Calcule os marcadores **antes** de remover os jobs terminados.

## Como o tester valida

- dois jobs curtos e um longo; `jobs` mostra os dois `Done` e o `Running`;
- `jobs` de novo mostra só o longo.

## Dicas

- Formato de uma linha de `jobs`: `[N]M  ESTADO COMANDO`, onde `M` é `+` (job mais recente), `-` (o anterior) ou espaço, e `ESTADO` é `Running` ou `Done` alinhado à esquerda em 24 colunas. Em Java: `String.format("[%d]%c  %-24s%s", n, m, estado, comando)`.

## Critério de conclusão

Vários jobs são colhidos.
