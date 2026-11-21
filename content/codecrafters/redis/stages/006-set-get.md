Agora o Redis vira um banco: `SET chave valor` guarda (responde `+OK`) e `GET chave` devolve o
valor como bulk string — ou `$-1\r\n` (nulo) se a chave não existir.

## O que você vai aprender

- o keyspace: um mapa de chave para valor, compartilhado por todos os clientes.

## O que fazer

Guarde os valores num `Map<String, ...>`. `SET` de uma chave existente substitui o valor.

## Como o tester valida

- `SET`/`GET`, sobrescrita e `GET` de chave inexistente.

## Dicas

- Trate strings como bytes (por exemplo, decodificando como ISO-8859-1): no stage 100 os valores viram bitmaps binários.

## Critério de conclusão

`SET` e `GET` funcionam.
