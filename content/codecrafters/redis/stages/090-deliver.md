Cada assinante recebe `["message", canal, mensagem]`. A entrega é escrita na conexão do assinante
pela thread de quem publicou.

## O que você vai aprender

- escrita concorrente na mesma conexão.

## O que fazer

Para cada assinante, escreva o array na conexão dele (sincronize as escritas da conexão).

## Como o tester valida

- dois assinantes recebem; quem assina outro canal não recebe.

## Critério de conclusão

Mensagens são entregues.
