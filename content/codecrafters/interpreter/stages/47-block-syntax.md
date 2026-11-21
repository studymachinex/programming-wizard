Um bloco agrupa statements entre chaves. Sem o `}`: `Expect '}' after block.`

## O que você vai aprender

- statements compostos.

## O que fazer

`block → "{" declaration* "}"`. Por enquanto, execute os statements em sequência.

## Como o tester valida

- blocos simples e aninhados;
- bloco sem fechamento (65).

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.

## Critério de conclusão

Blocos são parseados e executados.
