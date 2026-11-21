E o maior prefixo comum também.

## O que você vai aprender

- a fechar o comportamento do Tab.

## O que fazer

Aplique o prefixo comum aos candidatos do completer.

## Como o tester valida

- `deploy rel` + Tab → `$ deploy release-`;
- `b` + Tab → `$ deploy release-beta `.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Prefixo comum com o completer.
