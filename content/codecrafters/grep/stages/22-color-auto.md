`--color=auto` destaca **só se a saída for um terminal**. Quando a saída vai para um pipe
ou arquivo, códigos ANSI só atrapalham (quem lê é outro programa).

## O que você vai aprender

- a detectar se o stdout é um terminal.

## O que fazer

Com `--color=auto`, destaque apenas se o stdout for um terminal.

## Como o tester valida

- roda com `--color=auto` lendo a saída por um **pipe**: ela não pode ter códigos ANSI.

## Dicas

- Em Java 22+, `System.console().isTerminal()` diz se o console é interativo. No Java 21, `System.console()` é `null` quando a saída não é um terminal. Para compilar com `release 21` e funcionar nos dois, chame `isTerminal` por reflexão se existir.

## Critério de conclusão

`--color=auto` destaca só em terminais.
