`*` repete o item **zero ou mais vezes**: `ca*t` casa com `ct`, `cat`, `caaat`.

## O que você vai aprender

- o cuidado com repetições que não consomem nada (loops infinitos).

## O que fazer

Implemente `*` como `{0,∞}` com o mesmo mecanismo do `+`.

## Como o tester valida

- `ca*t`, `^ca*t$` contra `cart` (não casa), `k\d*t`;
- `-o -E 'ba*'` contra `b baa baaaa`.

## Dicas

- Se uma repetição casou sem avançar, pare de repetir — senão `(a*)*` nunca termina.

## Critério de conclusão

`*` funciona.
