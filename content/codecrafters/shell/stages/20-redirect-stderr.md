`2> arquivo` faz o mesmo com o **stderr**.

## O que você vai aprender

- a separar as duas saídas de um processo.

## O que fazer

Reconheça `2>` e use `redirectError(...)` nos programas e um `PrintStream` de erro nos builtins.

## Como o tester valida

- `ls nao_existe 2> erros.txt`: nada na tela, a mensagem no arquivo;
- `echo '<cor>' 2> vazio.txt`: o texto na tela, arquivo criado vazio;
- `cat <existe> sumiu 2> erros2.txt`.

## Critério de conclusão

Redirecionar o stderr funciona.
