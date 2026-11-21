Mesma regra dos comandos: sem candidatos, toque o sinal e deixe a linha intacta — inclusive
quando o diretório da palavra nem existe.

## O que você vai aprender

- a tratar erros de E/S na completação sem quebrar o shell.

## O que fazer

Se o diretório não existir ou nada combinar, escreva BEL.

## Como o tester valida

- `cat zz<id>` + Tab → BEL;
- Backspace até limpar a linha;
- `cat pasta_<id>/a` + Tab (diretório inexistente) → BEL.

## Dicas

- O tester usa Backspace (byte 127) para limpar a linha: trate 127 e 8 apagando o último caractere com `\b \b`.
- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Tab sem arquivos toca o sinal.
