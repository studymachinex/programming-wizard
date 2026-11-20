Peça os metadados (o dicionário `info`) com a extensão **ut_metadata** (BEP 9).
Implemente o começo de `magnet_info`:

```bash
$ ./your_program.sh magnet_info "<magnet>"
```

## O que você vai aprender

- a usar o id de extensão **do peer** nas mensagens que você envia a ele;
- que os metadados são divididos em peças de 16 KiB, como o arquivo.

## O formato

Mensagem id 20; o payload começa com o id de `ut_metadata` **que o peer anunciou** (stage
15), seguido do dicionário:

```text
<tamanho><20><id do peer>d8:msg_typei0e5:piecei0ee
```

`msg_type: 0` é *request*; `piece: 0` é a primeira (e, aqui, única) peça dos metadados.

## O que fazer

1. Faça o handshake e a troca de extensões (stages 13–15).
2. Envie o request da peça 0.

## Como o tester valida

- confere, pelo peer, que chegou `{"msg_type": 0, "piece": 0}` com o id de extensão certo.

## Dicas

- Usar o **seu** id em vez do id do peer é o erro mais comum: o peer não reconhece a mensagem.

## Critério de conclusão

O peer recebe o pedido de metadados.
