Com escritas pendentes, o master manda `REPLCONF GETACK *` às réplicas e espera respostas
`REPLCONF ACK <offset>` com offset ≥ o seu até atingir o número pedido ou o timeout. Responde quantas
confirmaram.

## O que você vai aprender

- coordenação assíncrona com prazo.

## O que fazer

1. Guarde o offset atual do master (bytes propagados).
2. Envie GETACK a todas as réplicas (e some os bytes do GETACK ao offset).
3. Leia os ACKs das conexões das réplicas (sem responder) e conte as que alcançaram o offset guardado.

## Como o tester valida

- três réplicas, duas confirmam: `WAIT 3 600` → `:2` depois do timeout.

## Dicas

- O `REPLCONF ACK` chega pela mesma conexão em que a réplica fez o handshake — e não tem resposta.

## Critério de conclusão

`WAIT` conta as confirmações.
