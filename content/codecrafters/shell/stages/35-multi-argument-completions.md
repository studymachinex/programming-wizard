A completação vale para qualquer argumento, não só o primeiro.

## O que você vai aprender

- que a palavra completada é sempre a do cursor (a última).

## O que fazer

Garanta que você completa a **última** palavra, preservando o resto da linha.

## Como o tester valida

- `cat ap` + Tab, depois `ban` + Tab → `$ cat apple_<id>.txt banana_<id>.txt `;
- Enter mostra os dois arquivos.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Vários argumentos podem ser completados.
