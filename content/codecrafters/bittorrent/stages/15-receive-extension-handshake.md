O peer também envia o handshake de extensão dele. Leia o id que ele escolheu para
`ut_metadata` e imprima:

```bash
$ ./your_program.sh magnet_handshake "<magnet>"
Peer ID: 0102030405060708090a0b0c0d0e0f1011121314
Peer Metadata Extension ID: 123
```

## O que você vai aprender

- a ler mensagens até achar a que interessa, tratando as outras;
- o campo `metadata_size`, que diz o tamanho dos metadados.

## O que fazer

1. Leia mensagens até chegar uma id 20 com extensão `0`.
2. Decodifique o dicionário e pegue `m.ut_metadata` (e guarde `metadata_size`).
3. Imprima `Peer Metadata Extension ID: <id>`.

## Como o tester valida

- o peer anuncia um id aleatório; a saída precisa mostrá-lo.

## Dicas

- A ordem das mensagens não é garantida: o handshake de extensão do peer pode chegar antes
  ou depois do bitfield. Trate qualquer uma delas onde estiver lendo.

## Critério de conclusão

O cliente conhece o id de `ut_metadata` do peer.
