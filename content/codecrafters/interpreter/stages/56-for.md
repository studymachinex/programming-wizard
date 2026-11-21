`for (inicialização; condição; incremento) corpo` — cada parte é opcional. Não precisa de nó
novo: transforme em `{ inicialização; while (condição) { corpo; incremento; } }` no parser
(*desugaring*). A variável da inicialização só existe dentro do laço.

## O que você vai aprender

- desugaring: implementar uma construção com outras já existentes.

## O que fazer

Parseie as três partes e monte a árvore equivalente com `Block` e `While`.

## Como o tester valida

- contagem, `for` sem inicialização/incremento, Fibonacci;
- a variável do laço não existe fora dele (erro 70).

## Critério de conclusão

`for` funciona.
