Com o bit ligado nos dois lados, troque o **handshake de extensão**: uma mensagem que diz
quais extensões você entende e com qual id.

## O que você vai aprender

- o formato das mensagens de extensão (id 20);
- que cada lado escolhe os **próprios** ids para as extensões — eles não precisam bater.

## O formato

Uma mensagem comum do protocolo peer wire com id **20**. O payload começa com o id da
extensão (`0` = handshake de extensão), seguido de um dicionário bencodado:

```text
<tamanho><20><0>d1:md11:ut_metadatai16eee
```

`{"m": {"ut_metadata": 16}}` diz ao peer: "quando me mandar mensagens de metadados, use o
id 16".

## O que fazer

1. Depois do handshake, espere o **bitfield** do peer.
2. Envie o handshake de extensão com `ut_metadata` e um id à sua escolha (1–255).

## Como o tester valida

- confere, pelo peer, que chegou uma mensagem id 20, extensão 0, com `m.ut_metadata`.

## Dicas

- Reaproveite o encoder de bencode do stage 6.
- O peer pode mandar o handshake de extensão dele antes ou depois do seu: o próximo stage
  trata disso.

## Critério de conclusão

O peer recebe o seu handshake de extensão.
