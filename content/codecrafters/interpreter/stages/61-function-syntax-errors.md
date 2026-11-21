Mensagens:

- `Expect function name.`
- `Expect '(' after function name.`
- `Expect parameter name.` / `Expect ')' after parameters.`
- `Expect '{' before function body.`
- `Expect ')' after arguments.`

## O que você vai aprender

- a validar declarações.

## O que fazer

Use `consume(tipo, mensagem)` em cada passo da declaração.

## Como o tester valida

- parâmetros sem vírgula, função sem nome, argumento faltando, corpo sem chaves.

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.

## Critério de conclusão

Erros de sintaxe em funções são reportados.
