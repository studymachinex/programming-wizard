A seta para cima chega ao shell como três bytes: `ESC [ A` (`\u001b[A`). Cada toque troca
a linha atual pelo comando anterior do histórico.

## O que você vai aprender

- sequências de escape de teclado;
- a redesenhar a linha no terminal.

## O que fazer

1. No editor de linha, ao ler `ESC`, leia mais dois bytes; `[A` é a seta para cima.
2. Mantenha um índice no histórico; a cada ↑, volte uma posição (sem passar do início).
3. Redesenhe: `\r` (volta ao início da linha), `\u001b[K` (apaga até o fim), `$ ` + comando.

## Como o tester valida

- dois comandos; ↑ → `$ <segundo>`; ↑ → `$ <primeiro>`.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

↑ navega pelo histórico.
