**Lock otimista**: `WATCH chave` pede "se esta chave mudar antes do meu EXEC, cancele a
transação". Primeiro passo: responder `+OK`.

## O que você vai aprender

- controle de concorrência otimista (sem bloquear ninguém).

## O que fazer

Crie o comando `WATCH`.

## Como o tester valida

- `WATCH <chave>` → `+OK`.

## Critério de conclusão

`WATCH` existe.
