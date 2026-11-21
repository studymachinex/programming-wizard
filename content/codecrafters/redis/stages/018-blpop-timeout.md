O timeout do `BLPOP` é em **segundos** (pode ser fracionário: `0.2`). Se acabar sem elemento, a
resposta é o array nulo `*-1\r\n`.

## O que você vai aprender

- espera com prazo.

## O que fazer

Calcule o instante-limite e espere no máximo até ele.

## Como o tester valida

- `BLPOP k 0.2` numa lista vazia → `*-1` depois de ~200 ms;
- `BLPOP k 2` atendido antes do prazo.

## Critério de conclusão

`BLPOP` respeita o timeout.
