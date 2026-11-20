O **tracker** é um servidor HTTP que diz quem tem o arquivo. Implemente `peers`:

```bash
$ ./your_program.sh peers exemplo.torrent
127.0.0.1:51413
127.0.0.1:51414
```

## O que você vai aprender

- o *announce*: um GET com o info hash e o estado do download;
- a enviar bytes arbitrários em uma URL com **percent-encoding**;
- a lista **compacta** de peers: 6 bytes por peer.

## O request

```http
GET <announce>?info_hash=%8C%1A%2E...&peer_id=...&port=6881&uploaded=0&downloaded=0&left=101458&compact=1
```

| Parâmetro | Valor |
|---|---|
| `info_hash` | os **20 bytes** do info hash (não o hex!), com percent-encoding |
| `peer_id` | 20 bytes que identificam o seu cliente (aleatórios) |
| `port` | uma porta (6881) |
| `uploaded`, `downloaded` | 0 |
| `left` | bytes que faltam (o tamanho do arquivo) |
| `compact` | 1 |

## A resposta

Um dicionário bencodado; `peers` é uma string binária com 6 bytes por peer: 4 do IPv4 e 2
da porta (big-endian).

```text
d8:intervali60e5:peers12:<6 bytes><6 bytes>e
```

## O que fazer

1. Monte a URL, faça o GET e decodifique a resposta.
2. Se houver `failure reason`, mostre o erro.
3. Imprima cada peer como `ip:porta`.

## Como o tester valida

- sobe um tracker local que valida `info_hash`, `peer_id`, `port`, `left` e `compact=1`;
- confere que todos os peers devolvidos aparecem na saída.

## Dicas

- `URLEncoder` codifica texto, não bytes: escreva `%XX` para cada byte você mesmo.
- O peer id é o mesmo durante toda a execução — gere uma vez.

## Critério de conclusão

`peers` lista os peers informados pelo tracker.
