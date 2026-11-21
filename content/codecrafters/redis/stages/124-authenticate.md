Depois de `AUTH`, a conexão nova funciona normalmente.

## O que você vai aprender

- o fluxo completo de login.

## O que fazer

Marque a conexão como autenticada no `AUTH` bem-sucedido.

## Como o tester valida

- `NOAUTH` antes, `AUTH`, depois `SET`/`GET` e `ACL WHOAMI`.

## Dicas

- Parabéns: o seu servidor fala RESP, tem cinco tipos de dados, transações, replicação, persistência, pub/sub e autenticação.

## Critério de conclusão

O servidor está completo.
