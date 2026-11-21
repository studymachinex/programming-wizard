Métodos são funções declaradas na classe. `obj.metodo` busca primeiro nos campos, depois nos
métodos da classe; o método pode ser guardado numa variável e chamado depois.

## O que você vai aprender

- métodos como funções associadas à classe.

## O que fazer

Guarde os métodos no `LoxClass` (um `Map<String, Function>`) e procure-os no `get` da instância.

## Como o tester valida

- chamar método direto, via variável, e imprimir (`<fn nome>`).

## Critério de conclusão

Métodos funcionam.
