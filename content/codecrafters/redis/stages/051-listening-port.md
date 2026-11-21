Para a replicação, várias instâncias rodam na mesma máquina, cada uma na sua porta.

## O que você vai aprender

- configuração por linha de comando.

## O que fazer

Garanta que `--port` funciona e que duas instâncias convivem.

## Como o tester valida

- duas instâncias em portas diferentes respondendo `PING`.

## Dicas

- Nos stages de replicação o próprio tester faz o papel do outro lado: um master falso (para testar a sua réplica) ou réplicas falsas (para testar o seu master).

## Critério de conclusão

Instâncias rodam em portas diferentes.
