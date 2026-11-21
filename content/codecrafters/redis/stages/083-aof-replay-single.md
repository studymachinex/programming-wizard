Na inicialização, se o manifesto existir, leia-o, abra o arquivo incremental (`type i`) e
reexecute os comandos — sem gravá-los de novo.

## O que você vai aprender

- recuperação a partir de log.

## O que fazer

Parseie o manifesto, leia os comandos RESP do arquivo e execute cada um.

## Como o tester valida

- um AOF com um `SET`; `GET` depois de iniciar.

## Dicas

- Layout: `<dir>/<appenddirname>/` com o manifesto `<appendfilename>.manifest` (conteúdo: `file <appendfilename>.1.incr.aof seq 1 type i` + `\n`) e o arquivo incremental `<appendfilename>.1.incr.aof`, onde cada comando de escrita é gravado como array RESP.

## Critério de conclusão

O AOF é reexecutado.
