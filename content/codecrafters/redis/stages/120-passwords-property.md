Depois das flags vem `passwords`: a lista dos hashes SHA-256 (em hexadecimal) das senhas. A
resposta completa do `default` fica `[flags, [nopass], passwords, []]`.

## O que você vai aprender

- guardar hashes, nunca senhas.

## O que fazer

Acrescente `passwords` e o array de hashes.

## Como o tester valida

- a resposta completa do `ACL GETUSER default`.

## Critério de conclusão

`passwords` aparece.
