Cada mensagem de uma partição tem um **offset** sequencial. Quem decide os offsets é o
broker, não o produtor.

## O que você vai aprender

- por que o `baseOffset` do batch é reescrito pelo broker;
- por que isso não invalida o CRC: o CRC cobre de `attributes` em diante.

## O que fazer

1. Descubra o próximo offset da partição: percorra os batches do log; o próximo é
   `baseOffset + lastOffsetDelta + 1` do último.
2. Para cada batch recebido, sobrescreva o `baseOffset` (os 8 primeiros bytes) com o
   próximo offset e avance `lastOffsetDelta + 1`.
3. Responda `base_offset` com o offset do primeiro batch gravado.

## Como o tester valida

- produz um batch com várias mensagens (`base_offset = 0`);
- produz outro e espera `base_offset` igual ao número de mensagens do primeiro;
- confere o arquivo: os dois batches, com o `baseOffset` do segundo reescrito.

## Dicas

- Faça a gravação dentro de um bloco `synchronized`: dois produtores na mesma partição não
  podem receber o mesmo offset.

## Critério de conclusão

O broker atribui offsets sequenciais.
