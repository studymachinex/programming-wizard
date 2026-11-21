O completer recebe: `$1` = nome do comando, `$2` = palavra sendo completada (pode ser
vazia), `$3` = palavra anterior.

## O que você vai aprender

- o protocolo que ferramentas usam para implementar a própria completação.

## O que fazer

Confira os três argumentos. Em `deploy pr`, a palavra anterior é o próprio `deploy`.

## Como o tester valida

- `deploy --env st` + Tab → o completer recebe `deploy`, `st`, `--env`;
- `deploy pr` + Tab → `deploy`, `pr`, `deploy`.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

O completer recebe os argumentos certos.
