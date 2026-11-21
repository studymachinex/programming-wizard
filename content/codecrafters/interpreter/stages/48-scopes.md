Cada bloco cria um **escopo**: variáveis declaradas nele só existem ali dentro e podem
**sombrear** as de fora. Atribuições alcançam a variável mais próxima.

## O que você vai aprender

- cadeias de ambientes (cada um aponta para o que o envolve).

## O que fazer

Dê ao `Environment` um `enclosing`. Ao executar um bloco, crie um ambiente novo filho do atual e
restaure o anterior no fim (num `finally`). `get` e `assign` sobem a cadeia.

## Como o tester valida

- sombreamento e restauração;
- atribuição a variável externa de dentro de um bloco;
- variável de bloco acessada fora → erro 70.

## Dicas

- Erros de execução: imprima a mensagem no stderr e, na linha seguinte, `[line N]`; termine com código **70**.

## Critério de conclusão

Escopos funcionam.
