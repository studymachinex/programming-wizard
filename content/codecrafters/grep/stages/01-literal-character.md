Neste desafio você vai construir o `grep`, a ferramenta que filtra linhas com expressões
regulares — e, mais importante, o **motor de expressões regulares** dele, escrito por você.

O programa recebe o padrão depois de `-E` e lê a entrada do stdin. O resultado do primeiro
stage é só o **código de saída**: `0` se casou, `1` se não.

```bash
$ echo -n "apple" | ./your_program.sh -E "a"; echo $?
0
$ echo -n "dog" | ./your_program.sh -E "a"; echo $?
1
```

## O que você vai aprender

- como ferramentas Unix comunicam resultado pelo código de saída;
- o ponto de partida de um motor de regex: casar um caractere literal.

## O que fazer

1. Leia o padrão (`args[1]`) e todo o stdin.
2. Se a entrada contém o caractere do padrão, saia com `0`; senão, com `1`.

O starter já traz esse código comentado.

## Como o tester valida

- roda `echo <palavra> | ./your_program.sh -E <letra>` com letras que aparecem e que não aparecem;
- confere só o código de saída.

## Dicas

- **Regra do desafio:** nada de `java.util.regex`. O tester procura o pacote no seu código e recusa.
- A partir do stage 13 a saída também é conferida; até lá, só o código de saída.

## Critério de conclusão

O programa diz, pelo código de saída, se a entrada contém o caractere.
