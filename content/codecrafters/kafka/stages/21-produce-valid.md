Agora um destino válido.

## O que fazer

Para tópico e partição existentes, responda `error_code = 0`, `base_offset = 0` (o
primeiro offset da partição), `log_append_time_ms = -1` e `log_start_offset = 0`.

## Como o tester valida

- produz um batch para a partição 0 de um tópico válido e confere a resposta.

## Critério de conclusão

O broker aceita produce para destinos válidos.
