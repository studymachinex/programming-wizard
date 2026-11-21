Código malformado precisa gerar um erro claro:

```
[line 1] Error at ')': Expect expression.
[line 1] Error at end: Expect ')' after expression.
```

O formato é `[line N] Error at '<lexema>': <mensagem>`; se o problema for o fim do arquivo,
`Error at end`. O código de saída é **65**. Erros léxicos também levam a 65 antes de parsear.

## O que você vai aprender

- a reportar erros de sintaxe com contexto.

## O que fazer

Quando `primary` não reconhece o token: `Expect expression.`. Quando falta o `)`:
`Expect ')' after expression.`. Lance uma exceção para abortar o parse.

## Como o tester valida

- `(72 +)` → `Expect expression.`;
- parêntese sem fechamento;
- erro na linha 3;
- string não terminada (erro léxico) → 65.

## Dicas

- Erros de sintaxe/resolução: `[line N] Error at '<lexema>': <mensagem>` (ou `Error at end`) no stderr, código de saída **65**. O tester confere o código, a linha e a mensagem.

## Critério de conclusão

Erros de sintaxe são reportados.
