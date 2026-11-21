Uma conexão manda **vários** comandos, um depois do outro — às vezes no mesmo pacote TCP.

## O que você vai aprender

- que TCP é um fluxo de bytes: um `read()` pode trazer meio comando ou dois comandos.

## O que fazer

Fique num laço lendo comandos até o cliente fechar a conexão. Leia **por comando** (parseando o
RESP), não por `read()`.

## Como o tester valida

- três `PING` seguidos na mesma conexão;
- dois `PING` na mesma escrita → duas respostas.

## Critério de conclusão

Vários PINGs na mesma conexão funcionam.
