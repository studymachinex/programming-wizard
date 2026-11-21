Agora o principal: se o comando não é builtin, encontre o executável no `PATH` (como no
`type`) e **execute-o** com os argumentos. A saída do programa vai direto para a tela.

```
$ custom_exe_4821 manga azul
Programa custom_exe_4821 executado com 2 argumento(s)
Argumento 1: manga
Argumento 2: azul
Assinatura: 527310
```

## O que você vai aprender

- a criar processos com `ProcessBuilder`;
- a herdar stdin/stdout/stderr (`inheritIO`).

## O que fazer

1. Ache o executável com a função do stage anterior.
2. `new ProcessBuilder(caminho, arg1, arg2, ...).inheritIO().start().waitFor()`.
3. Não achou: `<comando>: command not found`.

## Como o tester valida

- cria `custom_exe_NNNN`, que imprime os argumentos recebidos e uma assinatura;
- roda `custom_exe_NNNN <arg1> <arg2>` e compara a saída.

## Dicas

- Dê `flush` no seu stdout **antes** de iniciar o processo — senão a saída dele pode aparecer antes da sua.
- Passe o caminho completo encontrado como primeiro elemento — no Windows é ele que tem a extensão `.cmd`.
- Guarde o diretório atual numa variável do shell e use `processBuilder.directory(...)` — o `cd` (stage 10) vai mudá-lo.

## Critério de conclusão

O shell executa programas do `PATH`.
