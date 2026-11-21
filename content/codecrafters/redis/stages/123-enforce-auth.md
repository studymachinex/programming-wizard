Quando o `default` tem senha, conexões **novas** começam não autenticadas: qualquer comando além de
`AUTH` responde `-NOAUTH Authentication required.` (conexões já abertas continuam valendo).

## O que você vai aprender

- estado de autenticação.

## O que fazer

Ao abrir a conexão, ela só nasce autenticada se o `default` não tiver senha.

## Como o tester valida

- depois de definir a senha, uma conexão nova recebe `NOAUTH` em `GET` e `PING`.

## Critério de conclusão

A autenticação é exigida.
