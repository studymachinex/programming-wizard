`WAIT <réplicas> <timeout ms>` espera até tantas réplicas confirmarem as escritas anteriores e
devolve quantas confirmaram. Sem réplicas: `:0`.

## O que você vai aprender

- garantias de durabilidade sob demanda.

## O que fazer

Implemente `WAIT` devolvendo o número de réplicas conectadas quando não há nada a confirmar.

## Como o tester valida

- `WAIT 0 60000` e `WAIT 2 200` sem réplicas → `:0`.

## Critério de conclusão

`WAIT` funciona sem réplicas.
