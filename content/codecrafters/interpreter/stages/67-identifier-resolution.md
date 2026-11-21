Existe um bug sutil nas closures com ambientes dinâmicos:

```lox
var a = "global";
{
  fun mostra() { print a; }
  mostra();
  var a = "bloco";
  mostra();
}
```

Os dois `mostra()` devem imprimir `global`: a função se refere à variável que existia **quando foi
declarada**. Para isso, uma passada de **resolução** antes da execução calcula, para cada uso de
variável local, a quantos escopos de distância está a declaração.

## O que você vai aprender

- escopo léxico de verdade;
- análise estática: uma passada sobre a árvore antes de executar.

## O que fazer

1. Escreva um `Resolver` que percorre a árvore com uma pilha de escopos (`Map<String, Boolean>`).
2. Para cada `Variable`/`Assign`, procure o nome do escopo mais interno para fora e registre a
   distância no interpretador (`Map<Expr, Integer>` — use `IdentityHashMap`).
3. No interpretador, use `getAt(distância)`; sem registro, é global.

## Como o tester valida

- o exemplo acima e uma variação com função aninhada.

## Dicas

- Se os nós da sua árvore forem `record`s, dois nós iguais (`a + a`) seriam a mesma chave num `HashMap` — por isso, `IdentityHashMap`.

## Critério de conclusão

Variáveis são resolvidas estaticamente.
