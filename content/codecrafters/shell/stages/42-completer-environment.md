Além dos argumentos, o completer recebe duas variáveis de ambiente:

- `COMP_LINE`: a linha inteira digitada até agora;
- `COMP_POINT`: a posição do cursor (com o cursor no fim, o tamanho da linha).

## O que você vai aprender

- a passar variáveis de ambiente para processos filhos (`processBuilder.environment()`).

## O que fazer

Defina as duas variáveis antes de iniciar o completer.

## Como o tester valida

- `deploy --env pr` + Tab → `COMP_LINE=deploy --env pr`, `COMP_POINT=15`.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

O completer recebe `COMP_LINE` e `COMP_POINT`.
