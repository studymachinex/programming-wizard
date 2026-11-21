Se uma chave observada for modificada (por qualquer cliente) entre o `WATCH` e o `EXEC`, o `EXEC`
não executa nada e responde o array nulo `*-1\r\n`.

## O que você vai aprender

- versionamento de chaves.

## O que fazer

Guarde um número de versão por chave, incrementado a cada escrita. O `WATCH` anota a versão; o
`EXEC` compara.

## Como o tester valida

- outro cliente altera a chave → `EXEC` devolve `*-1` e o valor não muda;
- sem alteração → executa.

## Critério de conclusão

Modificações cancelam a transação.
