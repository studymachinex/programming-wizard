`--replicaof "host porta"` (um argumento só, com espaço) faz a instância ser **réplica** daquele
master. Numa réplica, `INFO replication` mostra `role:slave`.

## O que você vai aprender

- papéis de master e réplica.

## O que fazer

Leia `--replicaof` e ajuste o `role`.

## Como o tester valida

- sobe a instância com `--replicaof "localhost <porta do tester>"` e lê o INFO.

## Dicas

- Nos stages de replicação o próprio tester faz o papel do outro lado: um master falso (para testar a sua réplica) ou réplicas falsas (para testar o seu master).

## Critério de conclusão

Réplicas se identificam como `slave`.
