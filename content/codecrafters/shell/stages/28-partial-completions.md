Se todos os candidatos começam com algo **mais longo** do que o que foi digitado, o Tab
completa até esse **maior prefixo comum** (sem espaço no final, porque o nome ainda não acabou).

## O que você vai aprender

- o algoritmo de maior prefixo comum.

## O que fazer

Com vários candidatos, calcule o maior prefixo comum:

- maior que o texto digitado → complete até ele;
- igual → regra do stage anterior (BEL, depois lista).

Um Tab que mudou a linha **não** conta como "Tab anterior" para a lista.

## Como o tester valida

- cria `p<id>_foo`, `p<id>_foo_bar` e `p<id>_foo_bar_baz`;
- `p<id>_` + Tab → `$ p<id>_foo`;
- `_` + Tab → `$ p<id>_foo_bar`;
- `_` + Tab → `$ p<id>_foo_bar_baz ` (único: completa com espaço).

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Tab completa até o maior prefixo comum.
