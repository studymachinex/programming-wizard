Um `&` no fim da linha inicia o comando em **background**: o shell não espera o processo
terminar; mostra `[número do job] PID` e volta ao prompt na hora.

## O que você vai aprender

- a diferença entre esperar (`waitFor`) e não esperar um processo.

## O que fazer

1. Reconheça `&` (fora de aspas) no final.
2. Inicie o processo sem `waitFor`, guarde-o numa lista de jobs com um número (1, 2, 3...).
3. Imprima `[N] <pid>` (`process.pid()`).

## Como o tester valida

- `sleep 20 &` → `[1] <pid>` e o prompt volta em segundos;
- `sleep 21 &` → `[2] <pid>`.

## Dicas

- Em background, não deixe o processo herdar o stdin do shell: use `redirectInput` de `/dev/null` (Unix) ou `NUL` (Windows).

## Critério de conclusão

Comandos com `&` rodam em background.
