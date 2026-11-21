Depois de assinar, a conexão entra em **modo inscrito**: só aceita `SUBSCRIBE`, `UNSUBSCRIBE`,
`PSUBSCRIBE`, `PUNSUBSCRIBE`, `PING`, `QUIT` e `RESET`. Outros comandos:

```
-ERR Can't execute 'set': only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context
```

## O que você vai aprender

- modos de conexão.

## O que fazer

Recuse os demais comandos com o nome em minúsculas na mensagem.

## Como o tester valida

- `SET` e `GET` depois de assinar.

## Critério de conclusão

O modo inscrito restringe comandos.
