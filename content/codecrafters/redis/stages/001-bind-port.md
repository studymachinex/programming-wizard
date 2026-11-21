Neste desafio você vai construir um servidor compatível com o **Redis**: o banco em memória
mais usado do mundo. Clientes conversam com ele por TCP usando o protocolo **RESP** — e, ao final,
o seu servidor vai entender listas, streams, transações, replicação, persistência, pub/sub e mais.

O primeiro passo é aceitar conexões TCP. O Redis usa a porta **6379** por padrão; o tester sempre
passa `--port <porta>` com uma porta livre, para não brigar com um Redis que já esteja rodando.

## O que você vai aprender

- como um servidor TCP aceita conexões (`ServerSocket`);
- por que usar `SO_REUSEADDR` (reiniciar o servidor sem esperar a porta liberar).

## O que fazer

1. Leia `--port` (padrão 6379).
2. Abra um `ServerSocket` nessa porta e aceite conexões.

O starter já traz esse código comentado.

## Como o tester valida

- inicia o servidor com `--port <porta livre>`;
- conecta na porta.

## Dicas

- Para testar à mão: `redis-cli -p <porta> <comando>` (se tiver o redis-cli instalado).

## Critério de conclusão

O servidor aceita conexões na porta recebida.
