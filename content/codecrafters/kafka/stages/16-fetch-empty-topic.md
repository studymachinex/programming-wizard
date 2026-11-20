Um tópico que existe mas ainda não tem mensagens.

## As mensagens em disco

Cada partição tem o seu log:

```text
<log.dirs>/<nome do tópico>-<partição>/00000000000000000000.log
```

## O que fazer

Para um tópico conhecido, responda `error_code = 0` e `records` vazio quando o log da
partição estiver vazio.

## Como o tester valida

- cria o tópico com o log da partição vazio e confere `error_code = 0` e `records` vazio.

## Critério de conclusão

Tópicos vazios são respondidos sem erro.
