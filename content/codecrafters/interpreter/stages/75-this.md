Dentro de um método, `this` é a instância. Um método extraído (`var f = obj.m;`) continua
ligado à sua instância.

## O que você vai aprender

- *binding* de métodos.

## O que fazer

Ao buscar um método numa instância, crie uma cópia da função com um ambiente novo onde `this` está
definido (`bind`). No resolver, abra um escopo com `this` ao resolver os métodos.

## Como o tester valida

- `this.campo`, `return this` e encadeamento de chamadas.

## Critério de conclusão

`this` funciona.
