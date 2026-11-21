O **manifesto** diz quais arquivos compõem o AOF. Escreva `<appendfilename>.manifest` com:

```
file appendonly.aof.1.incr.aof seq 1 type i
```

## O que você vai aprender

- metadados de persistência.

## O que fazer

Grave o manifesto (com `\n` no fim).

## Como o tester valida

- o conteúdo exato do manifesto.

## Dicas

- Layout: `<dir>/<appenddirname>/` com o manifesto `<appendfilename>.manifest` (conteúdo: `file <appendfilename>.1.incr.aof seq 1 type i` + `\n`) e o arquivo incremental `<appendfilename>.1.incr.aof`, onde cada comando de escrita é gravado como array RESP.

## Critério de conclusão

O manifesto é criado.
