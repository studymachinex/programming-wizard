Builtins não são processos, mas também podem estar num pipeline: `echo ... | wc` ou
`ls | type exit`.

## O que você vai aprender

- a dar a builtins a mesma "interface" de um processo (entrada e saída).

## O que fazer

- builtin no meio/início: escreva a saída num `ByteArrayOutputStream` e alimente o próximo comando com ela;
- builtin no fim: escreva na tela (e descarte a entrada que chegar).

## Como o tester valida

- `echo <palavras> | wc`;
- `ls pasta | type exit` → `exit is a shell builtin`;
- `echo <palavras> | cat`.

## Critério de conclusão

Builtins funcionam em pipelines.
