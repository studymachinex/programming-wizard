Strings ficam entre `"`. O token tem o lexema **com** as aspas e o literal **sem**. Strings
podem ter várias linhas e não têm escapes. Sem a aspa de fechamento:
`[line N] Error: Unterminated string.`

```
STRING "ola mundo" ola mundo
```

## O que você vai aprender

- tokens com valor literal.

## O que fazer

Ao ver `"`, avance até a próxima `"` (contando as quebras de linha). Emita
`STRING "texto" texto`. Se o arquivo acabar antes, reporte o erro.

## Como o tester valida

- strings simples, com espaços, com `//` dentro (não é comentário!);
- uma string sem fechamento → erro e código 65.

## Critério de conclusão

Strings são reconhecidas.
