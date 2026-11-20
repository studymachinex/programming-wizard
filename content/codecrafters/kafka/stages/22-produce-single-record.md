Grave a mensagem em disco.

## O que fazer

Acrescente os bytes de `records` ao fim do log da partição
(`<log.dirs>/<tópico>-<partição>/00000000000000000000.log`), criando o arquivo se precisar.

## Como o tester valida

- produz um batch com uma mensagem e confere que o arquivo do log tem exatamente esses bytes.

## Dicas

- `Files.write(path, bytes, CREATE, APPEND)`.
- A partir daqui, o Fetch (stages 17–18) já devolve o que foi produzido.

## Critério de conclusão

As mensagens produzidas ficam no log da partição.
