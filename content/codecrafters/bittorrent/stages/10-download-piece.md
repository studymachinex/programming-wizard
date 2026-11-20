Agora o download de verdade. Implemente `download_piece`:

```bash
$ ./your_program.sh download_piece -o /tmp/piece-0 exemplo.torrent 0
```

## O que você vai aprender

- as mensagens do protocolo peer wire e a negociação choke/unchoke;
- por que peças são pedidas em **blocos** de 16 KiB;
- *pipelining*: manter vários pedidos em andamento para não esperar a rede a cada bloco.

## Mensagens

Depois do handshake, cada mensagem é `<tamanho 4 bytes><id 1 byte><payload>`; o tamanho
conta o id e o payload. Tamanho 0 é *keep-alive* (ignore).

| id | Nome | Payload |
|---:|---|---|
| 0 | choke | — |
| 1 | unchoke | — |
| 2 | interested | — |
| 5 | bitfield | um bit por peça que o peer tem |
| 6 | request | índice, início, tamanho (3 × 4 bytes) |
| 7 | piece | índice, início (2 × 4 bytes) + os dados do bloco |

## O fluxo

1. Descubra um peer (stage 8) e faça o handshake (stage 9).
2. Espere o **bitfield** do peer.
3. Envie **interested** e espere o **unchoke** — antes disso, o peer não atende pedidos.
4. Divida a peça em blocos de **16384 bytes** (o último pode ser menor) e envie um
   **request** por bloco.
5. Para cada **piece** recebida, copie os dados para a posição `início` da peça.
6. Confira o SHA-1 da peça com o hash do torrent e grave em `-o`.

## Como o tester valida

- os peers locais rejeitam requests antes do unchoke, blocos maiores que 16 KiB e
  pedidos além do fim da peça;
- baixa uma peça do meio e a **última** (que é menor) e compara byte a byte.

## Dicas

- O tamanho da última peça é `length - índice × piece length`.
- Mantenha uns 5 requests em andamento; esperar cada bloco antes do próximo funciona, mas
  é lento.
- `DataInputStream.readInt()` lê inteiros big-endian, exatamente o formato do protocolo.

## Critério de conclusão

`download_piece` baixa e verifica qualquer peça.
