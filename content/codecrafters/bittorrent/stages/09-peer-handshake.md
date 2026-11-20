Para conversar com um peer, abra uma conexão TCP e troque o **handshake**. Implemente
`handshake <torrent> <ip:porta>`:

```bash
$ ./your_program.sh handshake exemplo.torrent 127.0.0.1:51413
Peer ID: 0102030405060708090a0b0c0d0e0f1011121314
```

## O que você vai aprender

- o protocolo **peer wire**, que roda direto sobre TCP;
- como os dois lados confirmam que falam do mesmo torrent.

## O formato (68 bytes)

| Bytes | Campo |
|---:|---|
| 1 | `19` (tamanho do nome do protocolo) |
| 19 | `BitTorrent protocol` |
| 8 | reservados (zeros por enquanto) |
| 20 | info hash |
| 20 | peer id |

## O que fazer

1. Conecte com `new Socket()` no endereço dado.
2. Envie os 68 bytes.
3. Leia os 68 bytes da resposta (`readNBytes(68)`).
4. Confira que o info hash da resposta é o mesmo.
5. Imprima `Peer ID: <últimos 20 bytes em hex>`.

## Como o tester valida

- o peer local confere o protocolo e o info hash do seu handshake;
- compara a linha `Peer ID:` com o id do peer.

## Dicas

- Use um timeout no socket (`setSoTimeout`) para não travar se algo der errado.
- Em TCP, `read()` pode devolver menos bytes que o pedido; `readNBytes` lê até completar.

## Critério de conclusão

O handshake é aceito e o peer id é impresso.
