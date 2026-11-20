Com `--color=always`, o grep destaca o trecho que casou usando **códigos ANSI**:

```text
\e[01;31m\e[K<trecho>\e[m\e[K
```

`\e` é o caractere ESC (`\u001b`). `01;31` liga negrito e vermelho; `\e[m` volta ao normal;
`\e[K` limpa até o fim da linha (o GNU grep usa os dois).

## O que você vai aprender

- como terminais interpretam sequências de escape ANSI.

## O que fazer

Com `--color=always`, imprima a linha com o trecho do match envolvido pelos códigos acima.

## Como o tester valida

- `\d` em `sally has N apples`: a saída precisa ter os códigos exatos em volta do dígito.

## Dicas

- Em Java: `"\u001b[01;31m\u001b[K"` e `"\u001b[m\u001b[K"`.

## Critério de conclusão

O match aparece destacado.
