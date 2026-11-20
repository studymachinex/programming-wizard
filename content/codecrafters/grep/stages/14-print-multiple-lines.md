A entrada pode ter **várias linhas**. O grep avalia cada uma separadamente.

## O que você vai aprender

- que `^` e `$` se referem à linha, não à entrada inteira.

## O que fazer

Divida a entrada em linhas, imprima as que casarem, na ordem, e saia com `0` se pelo menos uma casou.

## Como o tester valida

- 5 linhas, algumas casando com `_(pie|juice)$`; a saída deve ter só essas, na ordem.

## Critério de conclusão

Todas as linhas que casam são impressas.
