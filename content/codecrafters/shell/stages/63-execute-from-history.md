O comando recuperado com ↑ é uma linha como outra qualquer: Enter executa, e ele entra de
novo no histórico.

## O que você vai aprender

- que a navegação só preenche o buffer.

## O que fazer

Garanta que o buffer (e não só a tela) recebe o comando recuperado.

## Como o tester valida

- dois comandos, ↑ ↑, Enter → executa o primeiro;
- `history` mostra o comando repetido.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Comandos do histórico podem ser reexecutados.
