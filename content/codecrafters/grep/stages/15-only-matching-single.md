Com `-o`, o grep imprime **só o trecho** que casou, não a linha inteira.

```bash
$ echo "sally has 3 apples" | ./your_program.sh -o -E "\d"
3
```

## O que você vai aprender

- a devolver a posição do match (início e fim), não só verdadeiro/falso.

## O que fazer

1. Faça o motor devolver onde o match começa e termina.
2. Com `-o`, imprima `linha.substring(início, fim)`.

## Como o tester valida

- `echo 'sally has 5 apples' | ./your_program.sh -o -E '\d'` → `5`.

## Critério de conclusão

`-o` imprime o trecho que casou.
