Um caractere que não pertence à linguagem (`$`, `#`, `@`, `%`...) é um **erro léxico**. O
scanner reporta o erro no stderr e **continua**: os tokens válidos ainda são impressos. No fim, o
código de saída é **65**.

## O que você vai aprender

- a reportar erros sem abortar (para mostrar todos de uma vez);
- o código de saída 65 (dados de entrada inválidos).

## O que fazer

Para cada caractere inválido escreva no **stderr**:

```
[line 1] Error: Unexpected character: $
```

Continue o scan; se houve erro, termine com `System.exit(65)` depois de imprimir os tokens.

## Como o tester valida

- sequências com caracteres válidos e inválidos;
- confere o stdout (tokens válidos), cada linha de erro no stderr e o código 65.

## Dicas

- Guarde um `hadError` global — os próximos estágios (parser, resolver) reaproveitam.

## Critério de conclusão

Erros léxicos são reportados e o código de saída é 65.
