Ler uma variável que não existe é erro de execução: `Undefined variable 'x'.`

## O que você vai aprender

- erros de nome em linguagens dinâmicas.

## O que fazer

No `get`, se o nome não existir, lance a `RuntimeError`.

## Como o tester valida

- `print x;` sem declarar;
- a saída anterior ao erro continua aparecendo.

## Dicas

- Erros de execução: imprima a mensagem no stderr e, na linha seguinte, `[line N]`; termine com código **70**.

## Critério de conclusão

Variáveis indefinidas geram erro.
