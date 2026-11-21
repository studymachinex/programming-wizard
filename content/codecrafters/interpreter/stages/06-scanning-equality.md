`=` é atribuição (`EQUAL`) e `==` é comparação (`EQUAL_EQUAL`). Ao ver `=`, olhe o próximo
caractere: se for outro `=`, é um token só de dois caracteres.

```
EQUAL = null
EQUAL_EQUAL == null
```

## O que você vai aprender

- *lookahead* de um caractere.

## O que fazer

Implemente um `match(char esperado)` que consome o próximo caractere só se ele for o esperado.

## Como o tester valida

- `={===}` e combinações aleatórias: `===` vira `EQUAL_EQUAL` seguido de `EQUAL`.

## Critério de conclusão

`=` e `==` são reconhecidos.
