Em escopo local, declarar duas vezes o mesmo nome é erro:
`Already a variable with this name in this scope.` — inclusive parâmetros repetidos ou uma local com o
nome de um parâmetro. No escopo global continua permitido.

## O que você vai aprender

- regras diferentes para escopo global e local.

## O que fazer

No `declare`, se o nome já existir no escopo atual, reporte.

## Como o tester valida

- em bloco, parâmetro × local, parâmetros repetidos; e o caso global (permitido).

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.

## Critério de conclusão

Redeclarações locais são detectadas.
