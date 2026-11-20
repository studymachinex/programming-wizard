Para pedir os metadados a um peer, os dois lados precisam falar o **protocolo de
extensões** (BEP 10). O suporte é anunciado no handshake, nos bytes reservados.

```bash
$ ./your_program.sh magnet_handshake "<magnet>"
Peer ID: 0102030405060708090a0b0c0d0e0f1011121314
```

## O que você vai aprender

- como protocolos evoluem sem quebrar clientes antigos: bits reservados desde o início;
- a negociar capacidades no handshake.

## O que fazer

1. Faça o announce no tracker do magnet. Como você ainda não sabe o tamanho do arquivo,
   envie qualquer `left` positivo (ex.: `999`).
2. Conecte no primeiro peer e envie o handshake com o **bit 20** ligado: no 6º byte
   reservado (índice 5), o valor `0x10`.

```java
byte[] reserved = new byte[8];
reserved[5] = 0x10;
```

3. Leia o handshake do peer e imprima `Peer ID:`. Confira se o peer também ligou o bit.

## Como o tester valida

- confere o `Peer ID:` na saída;
- confere, pelo peer, que o seu handshake ligou o bit de extensões.

## Critério de conclusão

O handshake anuncia suporte a extensões.
