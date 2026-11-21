O Redis tem **usuários** (ACL). Toda conexão começa como o usuário `default`. `ACL WHOAMI` devolve
o nome do usuário da conexão (bulk string).

## O que você vai aprender

- controle de acesso por usuário.

## O que fazer

Guarde o usuário na conexão.

## Como o tester valida

- `ACL WHOAMI` → `default`.

## Critério de conclusão

`ACL WHOAMI` funciona.
