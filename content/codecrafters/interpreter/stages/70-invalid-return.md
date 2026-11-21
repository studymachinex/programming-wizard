`return` fora de função: `Can't return from top-level code.` (65). Como é um erro estático,
nada é executado — nem o `print` antes dele.

## O que você vai aprender

- rastrear contexto na análise estática.

## O que fazer

Mantenha no resolver o tipo da função atual (`NONE`, `FUNCTION`...).

## Como o tester valida

- `return` no topo e dentro de um bloco no topo; `return` válido dentro de função.

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.

## Critério de conclusão

`return` inválido é detectado.
