O método `init` é o construtor: roda ao criar a instância, com os argumentos da chamada. A
aridade da classe é a do `init`.

## O que você vai aprender

- construtores.

## O que fazer

No `call` da classe, se houver `init`, faça `bind` na instância nova e chame.

## Como o tester valida

- construtor com dois parâmetros; aridade errada (`Expected 1 arguments but got 0.`).

## Dicas

- Erros de execução: imprima a mensagem no stderr e, na linha seguinte, `[line N]`; termine com código **70**.

## Critério de conclusão

Construtores funcionam.
