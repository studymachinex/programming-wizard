Além de strings, o Redis guarda **listas**. `RPUSH chave elemento` cria a lista (se não existir),
acrescenta no final e responde o **tamanho** da lista como inteiro: `:1\r\n`.

## O que você vai aprender

- tipos de valor no keyspace.

## O que fazer

Guarde listas (por exemplo, `ArrayDeque<String>`) no mesmo mapa das strings.

## Como o tester valida

- `RPUSH <chave> <elemento>` → `:1`.

## Critério de conclusão

`RPUSH` cria listas.
