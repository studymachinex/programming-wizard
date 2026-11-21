`cd <caminho absoluto>` troca o diretório atual. Se o caminho não existir:

```
$ cd /tmp/pw/banana/azul
$ pwd
/tmp/pw/banana/azul
$ cd /tmp/pw/nao_existe
cd: /tmp/pw/nao_existe: No such file or directory
```

## O que você vai aprender

- por que `cd` não pode ser um programa externo (um processo filho não muda o diretório do pai).

## O que fazer

- se for um diretório, atualize `cwd`;
- senão, imprima `cd: <caminho>: No such file or directory` e mantenha o diretório.

## Como o tester valida

- `cd <diretório existente>` e depois `pwd`;
- `cd <diretório inexistente>` → mensagem de erro, e o `pwd` continua igual.

## Dicas

- No Windows o tester usa barras normais no comando (`cd C:/Users/...`); `Path.resolve` aceita as duas.
- Lembre de passar o `cwd` para os processos filhos (`ProcessBuilder.directory`).

## Critério de conclusão

`cd` com caminho absoluto funciona.
