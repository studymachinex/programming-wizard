O master tem um **ID de replicação** (40 caracteres alfanuméricos aleatórios) e um **offset**
(bytes de comandos já propagados, começando em 0). Ambos aparecem no INFO:

```
master_replid:8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb
master_repl_offset:0
```

## O que você vai aprender

- identificação do histórico de replicação.

## O que fazer

Gere o ID na inicialização e inclua as duas linhas.

## Como o tester valida

- confere o formato do ID e o offset 0.

## Critério de conclusão

ID e offset aparecem no INFO.
