O último stage: **vários tópicos, várias partições**, tudo no mesmo request.

## O que fazer

Nada novo, se os loops dos stages anteriores já percorrem todos os tópicos e partições do
request. Confira que a resposta tem um item por tópico, na ordem do request.

## Como o tester valida

- produz para 3 partições de 2 tópicos em um único request;
- confere as respostas e os três arquivos de log.

## Dicas

- Para ir além: implemente `acks`, retenção de log e o Fetch com `fetch_offset` no meio de
  um batch.

## Critério de conclusão

O broker produz para várias partições de vários tópicos de uma vez.
