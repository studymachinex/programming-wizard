Mensagens dos casos mais comuns:

- `Expect ';' after value.` (print sem `;`)
- `Expect '(' after 'while'.` / `Expect '(' after 'if'.` / `Expect '(' after 'for'.`
- `Expect ';' after loop condition.` / `Expect ')' after for clauses.`
- `Expect expression.`

## O que você vai aprender

- mensagens de erro úteis.

## O que fazer

Garanta as mensagens e as linhas corretas.

## Como o tester valida

- `print` sem `;`, `for` incompleto, `while` sem parênteses, expressão incompleta na linha 2.

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.

## Critério de conclusão

Erros de controle de fluxo são reportados.
