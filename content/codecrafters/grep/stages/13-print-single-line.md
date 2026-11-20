Até aqui só o código de saída importava. Agora o grep faz o que todo mundo espera:
**imprime a linha** que casou.

```bash
$ echo "I like mango" | ./your_program.sh -E "mango$"
I like mango
```

## O que você vai aprender

- a separar "casou?" de "o que imprimir".

## O que fazer

Se a linha casar, imprima-a (com `\n`) e saia com `0`. Se não, não imprima nada e saia com `1`.

## Como o tester valida

- uma linha que casa: a saída tem de ser exatamente a linha;
- uma linha que não casa: saída vazia e código 1.

## Dicas

- O `echo` coloca um `\n` no fim da entrada: ele não faz parte da linha.

## Critério de conclusão

A linha que casou é impressa.
