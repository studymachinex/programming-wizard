Se o completer não imprimir nada, é como não ter candidatos.

## O que você vai aprender

- que os casos de borda se repetem — e o código também pode.

## O que fazer

Saída vazia → BEL, linha intacta.

## Como o tester valida

- `deploy zz` + Tab → BEL.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Sem candidatos do completer, BEL.
