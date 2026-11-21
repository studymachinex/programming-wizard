Um job em background continua escrevendo na mesma tela — a saída aparece quando o processo
imprime, mesmo no meio do prompt.

## O que você vai aprender

- que background não significa silencioso.

## O que fazer

Mantenha o stdout/stderr herdados (`Redirect.INHERIT`) nos jobs.

## Como o tester valida

- `delayed_echo 0.5 <palavra> &` e espera a palavra aparecer na tela.

## Critério de conclusão

A saída dos jobs aparece.
