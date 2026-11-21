`super.metodo()` chama a versão da **superclasse** — da classe onde o método foi escrito, não da
classe da instância. Funciona em cadeias de herança e com `init`.

## O que você vai aprender

- como `super` é resolvido estaticamente.

## O que fazer

1. Parseie `super "." IDENTIFIER`.
2. Ao declarar uma subclasse, crie um ambiente com `super` apontando para a superclasse, em volta
   dos métodos (e um escopo equivalente no resolver).
3. Avaliar `super.m`: pegue a superclasse pela distância resolvida, o `this` uma distância abaixo,
   ache o método e faça `bind`.

## Como o tester valida

- cadeia de três classes, `super.init` e método de `super` extraído para uma variável.

## Critério de conclusão

`super` funciona.
