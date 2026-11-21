`ACL SETUSER default >senha` adiciona uma senha ao usuário (`+OK`). Com senha, o usuário perde a
flag `nopass` e `passwords` mostra o SHA-256 dela.

## O que você vai aprender

- hash de senhas com SHA-256.

## O que fazer

Guarde o hash (`MessageDigest.getInstance("SHA-256")`, em hexadecimal minúsculo).

## Como o tester valida

- `ACL SETUSER default >senha` e `ACL GETUSER default` → `[flags, [], passwords, [<sha256>]]`.

## Critério de conclusão

Senhas podem ser definidas.
