O primeiro **builtin** — um comando implementado pelo próprio shell, não por um programa
externo. `exit` encerra o shell (o código de saída é opcional: `exit 3`).

## O que você vai aprender

- a diferença entre builtins e programas externos;
- a encerrar o processo com um código de saída.

## O que fazer

Se o comando for `exit`, encerre com `System.exit(0)` (ou com o número passado, se houver).

## Como o tester valida

- roda um comando inválido;
- digita `exit` e espera o processo terminar com código **0**.

## Dicas

- Mais tarde (stage 68) o `exit` também vai salvar o histórico. Vale isolar a saída numa função.

## Critério de conclusão

`exit` encerra o shell com código 0.
