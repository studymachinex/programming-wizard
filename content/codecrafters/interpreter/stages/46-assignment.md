Atribuição é uma **expressão** (devolve o valor atribuído), associativa à direita:
`a = b = 3`. Só se pode atribuir a variáveis: `a + 1 = 3` é `Invalid assignment target.` (65).
Atribuir a uma variável inexistente é `Undefined variable 'x'.` (70).

## O que você vai aprender

- l-values: como o parser descobre que o lado esquerdo é um alvo válido.

## O que fazer

`assignment → IDENTIFIER "=" assignment | equality`. Parseie o lado esquerdo como expressão;
ao ver `=`, se for uma `Variable`, troque por `Assign`; senão, reporte o erro (sem abortar).

## Como o tester valida

- atribuições simples, encadeadas e dentro de `print`;
- alvo inválido (65) e variável inexistente (70).

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.
- Erros de execução: imprima a mensagem no stderr e, na linha seguinte, `[line N]`; termine com código **70**.

## Critério de conclusão

Atribuição funciona.
