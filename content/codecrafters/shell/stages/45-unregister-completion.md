`complete -r <nome>` remove o registro. Depois disso, os argumentos de `<nome>` voltam a
ser completados como arquivos.

## O que você vai aprender

- a manter a completação de arquivos como padrão.

## O que fazer

Remova o nome do mapa.

## Como o tester valida

- registra `deploy`, roda `complete -r deploy`;
- `complete -p deploy` → sem registro;
- `deploy st` + Tab → completa o arquivo `status_<id>.txt`.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

`complete -r` remove registros.
