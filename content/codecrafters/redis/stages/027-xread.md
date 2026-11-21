`XREAD STREAMS stream id` devolve as entradas com ID **maior** que o dado (exclusivo), no formato
`[[stream, [entradas...]]]`.

## O que você vai aprender

- leitura incremental: "me dê o que veio depois disto".

## O que fazer

Parseie `STREAMS` (sem diferenciar maiúsculas) e filtre por ID > dado.

## Como o tester valida

- `XREAD streams s 0-2` e `XREAD STREAMS s 0-0`.

## Dicas

- Cada entrada de stream é respondida como `[id, [campo1, valor1, campo2, valor2, ...]]`.

## Critério de conclusão

`XREAD` funciona com um stream.
