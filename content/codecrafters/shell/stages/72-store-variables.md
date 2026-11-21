`declare NOME=valor` cria (ou altera) uma variável **do shell** — ela não vai para o
ambiente dos processos filhos. No `declare -p`, variáveis do shell aparecem como
`declare -- NOME="valor"`.

## O que você vai aprender

- a guardar estado do usuário no shell.

## O que fazer

Mantenha um `Map<String, String>`. O argumento já chega sem aspas (o tokenizador resolveu):
`declare frase='a  b'` recebe `frase=a  b`. Separe no primeiro `=`.

## Como o tester valida

- `declare cor=<valor>` e `declare -p cor`;
- valor com espaços entre aspas simples;
- redefinir uma variável.

## Critério de conclusão

Variáveis do shell são guardadas.
