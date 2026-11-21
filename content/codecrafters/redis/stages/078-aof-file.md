Crie o arquivo incremental vazio `<appendfilename>.1.incr.aof` dentro do diretório.

## O que você vai aprender

- o AOF multi-arquivo do Redis 7.

## O que fazer

Crie o arquivo vazio.

## Como o tester valida

- o arquivo existe e está vazio.

## Dicas

- Layout: `<dir>/<appenddirname>/` com o manifesto `<appendfilename>.manifest` (conteúdo: `file <appendfilename>.1.incr.aof seq 1 type i` + `\n`) e o arquivo incremental `<appendfilename>.1.incr.aof`, onde cada comando de escrita é gravado como array RESP.

## Critério de conclusão

O arquivo incremental é criado.
