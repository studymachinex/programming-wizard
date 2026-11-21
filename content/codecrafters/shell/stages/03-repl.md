Um shell é um **REPL** (*read–eval–print loop*): depois de cada comando ele mostra o prompt
de novo e espera o próximo.

```
$ uva_1
uva_1: command not found
$ caju_2
caju_2: command not found
$ 
```

## O que você vai aprender

- a estrutura do loop principal de um interpretador.

## O que fazer

Coloque prompt + leitura + execução num `while (true)`. Se a leitura devolver `null` (fim do
stdin), encerre.

## Como o tester valida

- digita três comandos inválidos, um de cada vez;
- depois de cada um espera a mensagem de erro **e** um novo prompt `$ `.

## Dicas

- O tester só digita o próximo comando quando vê o prompt — esqueça o `flush` e ele fica esperando.

## Critério de conclusão

O shell processa comandos em sequência até o fim da entrada.
