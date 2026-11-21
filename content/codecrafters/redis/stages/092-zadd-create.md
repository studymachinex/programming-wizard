**Sorted sets**: membros únicos com um **score** numérico, sempre ordenados. `ZADD chave score
membro` responde quantos membros **novos** foram adicionados.

## O que você vai aprender

- a estrutura por trás de rankings e filas de prioridade.

## O que fazer

Guarde um mapa membro → score e uma estrutura ordenada (por exemplo, `TreeSet`).

## Como o tester valida

- `ZADD <chave> 10 <membro>` → `:1`.

## Dicas

- Ordem de um sorted set: por score crescente; scores iguais ficam em ordem lexicográfica do membro.

## Critério de conclusão

`ZADD` cria sorted sets.
