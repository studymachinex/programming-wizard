Cada comando de escrita é acrescentado ao arquivo incremental no formato RESP, **antes** de
responder ao cliente.

## O que você vai aprender

- write-ahead logging.

## O que fazer

Depois de executar um `SET`, acrescente o array RESP ao arquivo.

## Como o tester valida

- `SET` → o arquivo contém exatamente `*3\r\n$3\r\nSET\r\n...`.

## Dicas

- Layout: `<dir>/<appenddirname>/` com o manifesto `<appendfilename>.manifest` (conteúdo: `file <appendfilename>.1.incr.aof seq 1 type i` + `\n`) e o arquivo incremental `<appendfilename>.1.incr.aof`, onde cada comando de escrita é gravado como array RESP.

## Critério de conclusão

Comandos são gravados.
