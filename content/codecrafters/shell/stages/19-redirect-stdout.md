`comando > arquivo` (ou `1> arquivo`) grava o stdout no arquivo em vez de mostrar na tela,
criando ou **truncando** o arquivo. O stderr continua indo para a tela.

## O que você vai aprender

- os descritores de arquivo 1 (stdout) e 2 (stderr);
- `ProcessBuilder.Redirect` e como redirecionar builtins.

## O que fazer

1. No tokenizador, reconheça `>` e `1>` **fora de aspas** como operadores; a palavra seguinte é o destino.
2. Programas externos: `redirectOutput(ProcessBuilder.Redirect.to(arquivo))`.
3. Builtins: escreva num `PrintStream` aberto sobre o arquivo em vez de `System.out`.

O caminho é relativo ao diretório atual do shell.

## Como o tester valida

- `ls pasta > lista.txt` e confere o arquivo;
- `echo <palavra> 1> eco.txt`;
- `cat <existe> faltando 1> saida.txt`: o erro aparece na tela, o conteúdo vai para o arquivo.

## Dicas

- Faça os builtins receberem `out` e `err` como parâmetros — isso também vai ajudar nos pipelines.

## Critério de conclusão

Redirecionar o stdout funciona para builtins e programas.
