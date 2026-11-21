Clientes mandam comandos como **arrays RESP de bulk strings**. `PING` chega assim:

```
*1\r\n$4\r\nPING\r\n
```

e a resposta é a simple string `+PONG\r\n`.

## O que você vai aprender

- o formato RESP dos comandos e das respostas.

## O que fazer

Leia o comando da conexão e responda `+PONG\r\n`.

## Como o tester valida

- manda `PING` e espera `+PONG`.

## Dicas

- Tipos RESP: `+OK\r\n` (simple string), `-ERR ...\r\n` (erro), `:3\r\n` (inteiro), `$5\r\nmanga\r\n` (bulk string; `$-1\r\n` é nulo) e `*2\r\n...` (array; `*-1\r\n` é nulo).

## Critério de conclusão

O servidor responde a `PING`.
