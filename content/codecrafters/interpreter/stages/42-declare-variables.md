Variáveis globais: `var nome = expressão;` cria a variável; usar o nome na expressão lê o valor.

```lox
var preco = 20;
var total = preco * 3;
print total;
```

Saída:

```
60
```

## O que você vai aprender

- ambientes (*environments*): um mapa nome → valor.

## O que fazer

1. `varDecl → "var" IDENTIFIER ( "=" expression )? ";"`.
2. Um `Environment` com `define` e `get`.
3. `Variable(nome)` na árvore, avaliada com `environment.get`.

## Como o tester valida

- declara variáveis com números e strings e as combina.

## Critério de conclusão

Variáveis podem ser declaradas e lidas.
