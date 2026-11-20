# Build your own BitTorrent — Java

Esta é a implementação de referência (19/19) do desafio **BitTorrent** do Programming Wizard.

Você vai construir um cliente BitTorrent: bencode, arquivos `.torrent`, tracker HTTP,
protocolo peer wire, download de peças e, por fim, magnet links com a extensão de
metadados.

| Comando | O que faz |
|---|---|
| `decode <bencode>` | decodifica um valor bencodado e imprime em JSON |
| `info <arquivo.torrent>` | tracker, tamanho, info hash e hashes das peças |
| `peers <arquivo.torrent>` | lista os peers que o tracker devolve |
| `handshake <arquivo.torrent> <ip:porta>` | faz o handshake e imprime o peer id |
| `download_piece -o <saída> <arquivo.torrent> <índice>` | baixa uma peça |
| `download -o <saída> <arquivo.torrent>` | baixa o arquivo inteiro |
| `magnet_parse <magnet>` | tracker e info hash do magnet link |
| `magnet_handshake <magnet>` | handshake com extensões e ID de metadados do peer |
| `magnet_info <magnet>` | baixa os metadados e imprime como `info` |
| `magnet_download_piece -o <saída> <magnet> <índice>` | baixa uma peça a partir do magnet |
| `magnet_download -o <saída> <magnet>` | baixa o arquivo inteiro a partir do magnet |

## Comandos

Na raiz do Programming Wizard:

```bash
npm run cc -- task          # instruções do stage atual
npm run cc -- test          # roda os testes sem commitar
npm run cc -- submit        # commit + push; o hook do remote roda os testes
npm run cc -- status        # progresso
```

O tester sobe um tracker e peers **locais** (127.0.0.1): nada sai da sua máquina.

## Estrutura

- `your_program.sh` / `your_program.cmd` — compila e executa o cliente.
- `src/main/java/Main.java` — seu código.

Só a biblioteca padrão do Java é necessária (`java.net`, `java.security.MessageDigest`).
