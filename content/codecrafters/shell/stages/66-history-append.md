`history -a <arquivo>` acrescenta ao arquivo apenas as entradas **novas** — as que ainda não
foram gravadas por um `-a` (ou `-w`) anterior.

## O que você vai aprender

- a controlar "até onde já salvei" com um índice.

## O que fazer

Guarde o índice da primeira entrada ainda não gravada; após gravar, avance-o.

## Como o tester valida

- `echo ...`, `history -a anexo.txt` → o arquivo ganha os dois comandos;
- `echo ...`, `history -a anexo.txt` → ganha só os dois novos.

## Critério de conclusão

`history -a` acrescenta só o que é novo.
