O Tab só mexe na linha; o resto da digitação continua normalmente.

## O que você vai aprender

- que o buffer da linha é a fonte da verdade, e a tela é só um reflexo dele.

## O que fazer

Garanta que o texto completado entra no buffer — e não só na tela.

## Como o tester valida

- `ech` + Tab + `<palavras>` + Enter → imprime as palavras;
- `typ` + Tab + `echo` + Enter → `echo is a shell builtin`.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Comandos completados executam com os argumentos digitados depois.
