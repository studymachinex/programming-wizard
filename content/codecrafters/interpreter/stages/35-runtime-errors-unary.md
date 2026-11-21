Negar algo que não é número é um **erro de execução**:

```
Operand must be a number.
[line 1]
```

A mensagem vai para o stderr e o código de saída é **70**.

## O que você vai aprender

- erros de execução × erros de compilação (65 × 70).

## O que fazer

Crie uma `RuntimeError(token, mensagem)`. Capture no topo, imprima `mensagem` + `\n[line N]` no
stderr e saia com 70.

## Como o tester valida

- `-"texto"`, `-true`, e um caso na linha 2.

## Dicas

- Erros de execução: imprima a mensagem no stderr e, na linha seguinte, `[line N]`; termine com código **70**.

## Critério de conclusão

Erros de execução em unários são reportados.
