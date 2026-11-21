A seta para baixo (`ESC [ B`) faz o caminho inverso. Passando do último, a linha volta a ser
o que estava sendo digitado (vazia, no teste).

## O que você vai aprender

- a guardar o rascunho da linha atual durante a navegação.

## O que fazer

↓ avança o índice; ao chegar ao fim do histórico, restaure o rascunho.

## Como o tester valida

- ↑ ↑ → primeiro comando; ↓ → segundo; ↓ → linha vazia.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

↓ funciona.
