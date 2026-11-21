Com `appendonly yes`, crie `<dir>/<appenddirname>` na inicialização.

## O que você vai aprender

- preparação de armazenamento.

## O que fazer

`Files.createDirectories`. Sem `appendonly yes`, não crie nada.

## Como o tester valida

- o diretório existe com `yes` e não existe sem a flag.

## Dicas

- Layout: `<dir>/<appenddirname>/` com o manifesto `<appendfilename>.manifest` (conteúdo: `file <appendfilename>.1.incr.aof seq 1 type i` + `\n`) e o arquivo incremental `<appendfilename>.1.incr.aof`, onde cada comando de escrita é gravado como array RESP.

## Critério de conclusão

O diretório é criado.
