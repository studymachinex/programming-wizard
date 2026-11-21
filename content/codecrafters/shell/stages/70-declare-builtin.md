O shell tem **variáveis**. As de ambiente são herdadas do processo pai; `declare -p NOME`
mostra uma variável no formato de declaração. Para variáveis de ambiente (exportadas), o formato é
`declare -x NOME="valor"`.

## O que você vai aprender

- a diferença entre variáveis de ambiente e variáveis do shell.

## O que fazer

Crie o builtin `declare`. Com `-p NOME`, se `System.getenv(NOME)` existir, imprima
`declare -x NOME="valor"`.

## Como o tester valida

- `type declare` → builtin;
- `declare -p PW_FRUTA` (definida pelo tester) → `declare -x PW_FRUTA="<valor>"`.

## Dicas

- Dentro das aspas do valor, escape `\`, `"`, `$` e crase com uma barra (os testes não usam esses caracteres).

## Critério de conclusão

`declare -p` mostra variáveis de ambiente.
