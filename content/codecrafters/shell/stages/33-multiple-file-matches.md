Com vários arquivos, o mesmo ritual: BEL no primeiro Tab, lista no segundo. Na lista,
diretórios aparecem com `/` no final, e só o **nome** de cada entrada é mostrado.

## O que você vai aprender

- a reaproveitar a lógica de candidatos para comandos e arquivos.

## O que fazer

Generalize o código dos stages 27–28 para receber uma lista de candidatos com o texto que
entra na linha e o texto que aparece na lista.

## Como o tester valida

- cria `n<id>_a.txt`, `n<id>_b.log` e o diretório `n<id>_c`;
- `cat n<id>_` + Tab → BEL; Tab → `n<id>_a.txt  n<id>_b.log  n<id>_c/` e `$ cat n<id>_`.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Tab duplo lista arquivos e diretórios.
