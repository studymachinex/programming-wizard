Funções declaradas: `fun nome() { corpo }`. Impressas aparecem como `<fn nome>`; sem `return`,
devolvem `nil`.

## O que você vai aprender

- funções como valores de primeira classe.

## O que fazer

1. `funDecl → "fun" IDENTIFIER "(" parâmetros? ")" block`.
2. Um `Function` callable que executa o corpo num ambiente novo, filho do global.

## Como o tester valida

- declarar e chamar várias vezes, imprimir a função, chamar uma função de outra.

## Critério de conclusão

Funções sem argumentos funcionam.
