`XREAD BLOCK 1000 STREAMS s id` espera até 1000 ms por entradas novas. Se nada chegar, responde
`*-1`.

## O que você vai aprender

- leituras bloqueantes (a base de consumidores de eventos).

## O que fazer

Se não houver resultados, espere (liberando o lock) e confira de novo a cada `XADD`.

## Como o tester valida

- um cliente bloqueia e outro faz `XADD`; o primeiro recebe a entrada;
- `BLOCK 200` sem novidades → `*-1`.

## Critério de conclusão

`XREAD BLOCK` funciona.
