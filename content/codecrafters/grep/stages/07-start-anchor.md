`^` **ancora** o padrão no início da linha: `^log` casa com `log_7`, mas não com `big log`.

## O que você vai aprender

- âncoras: itens que casam com uma **posição**, não com um caractere.

## O que fazer

Se o padrão começar com `^`, tente casar só a partir da posição 0.

## Como o tester valida

- `^<palavra>` contra `<palavra>_N` casa; contra `big <palavra>` não.

## Critério de conclusão

`^` restringe o match ao início da linha.
