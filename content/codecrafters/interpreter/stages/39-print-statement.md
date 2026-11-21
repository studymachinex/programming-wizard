Agora o comando principal: `./your_program.sh run arquivo.lox` executa um **programa** — uma
lista de *statements* (comandos). O primeiro: `print <expressão>;`.

## O que você vai aprender

- a diferença entre expressões (produzem valor) e statements (produzem efeito).

## O que fazer

1. `program → statement* EOF`.
2. `printStmt → "print" expression ";"` — imprime o valor com o `stringify`.
3. Falta de expressão → `Expect expression.` (código 65).

## Como o tester valida

- `print "<palavra>";`, `print <expressão>;`, `print true;`;
- `print;` → erro de sintaxe.

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.

## Critério de conclusão

`print` funciona.
