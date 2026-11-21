`data.csv` e `data.csv.bak`: `da` + Tab completa até `data.csv` (prefixo comum). Daí em
diante, a ambiguidade continua — BEL e lista.

## O que você vai aprender

- a combinar todas as regras de completação.

## O que fazer

Aplique o maior prefixo comum aos arquivos.

## Como o tester valida

- `cat da` + Tab → `$ cat data_<id>.csv`;
- Tab → BEL; Tab → `data_<id>.csv  data_<id>.csv.bak`;
- `.b` + Tab → `$ cat data_<id>.csv.bak `.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Prefixo comum funciona com arquivos.
