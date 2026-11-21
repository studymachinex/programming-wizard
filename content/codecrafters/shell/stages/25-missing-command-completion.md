Quando nada combina, o shell não muda a linha — só toca o **sinal sonoro** (*bell*): o
caractere ASCII 7, `\u0007`.

## O que você vai aprender

- o caractere BEL e como terminais o usam para avisar.

## O que fazer

Se não houver candidatos, escreva `\u0007` e deixe a linha como está.

## Como o tester valida

- digita `xyz_<id>` + Tab: espera o BEL e a linha inalterada;
- Enter: `xyz_<id>: command not found`.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Tab sem candidatos toca o sinal.
