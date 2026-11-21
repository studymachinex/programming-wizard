Por enquanto o shell não conhece nenhum comando — então **todos** são inválidos. Leia uma
linha e responda como os shells de verdade:

```
$ banana_3f9a1c
banana_3f9a1c: command not found
```

## O que você vai aprender

- a ler uma linha do stdin;
- o formato padrão da mensagem de comando inexistente.

## O que fazer

1. Depois do prompt, leia uma linha.
2. Imprima `<comando>: command not found`.

Pode usar `System.err` (stderr) — o tester mescla stdout e stderr, como um terminal.

## Como o tester valida

- digita um nome aleatório (ex.: `banana_3f9a1c`) e Enter;
- espera a linha `banana_3f9a1c: command not found` na tela.

## Dicas

- Neste stage o shell pode terminar depois do primeiro comando; o loop vem no próximo.
- Um `BufferedReader` sobre `System.in` resolve por enquanto. No stage 23 você vai trocar a leitura por um editor de linha próprio.

## Critério de conclusão

Um comando desconhecido gera a mensagem `<comando>: command not found`.
