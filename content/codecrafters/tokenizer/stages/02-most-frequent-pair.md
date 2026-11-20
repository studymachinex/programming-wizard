O BPE cresce o vocabulário juntando o **par de tokens vizinhos mais frequente**.
Implemente o comando `pair`: dada uma sequência de ids, imprima esse par.

```bash
$ echo "1 2 3 1 2" | ./your_program.sh pair
1 2
```

## O que você vai aprender

- a ideia central do BPE: o que aparece junto com frequência vira um token só;
- a contar pares adjacentes em uma passada;
- por que a regra de desempate importa para o resultado ser reproduzível.

## O que fazer

1. Leia os ids do stdin (números separados por espaço).
2. Conte cada par adjacente `(ids[i], ids[i+1])`.
3. Imprima o par com a maior contagem, no formato `a b`.

**Regras:**

- pares sobrepostos contam: em `9 9 9`, o par `(9, 9)` aparece **2** vezes;
- **empate:** vence o par cuja **primeira ocorrência** aparece antes na sequência.

```java
Map<Long, Integer> counts = new LinkedHashMap<>(); // mantém a ordem de inserção
for (int i = 0; i + 1 < ids.size(); i++) {
  long key = ((long) ids.get(i) << 32) | ids.get(i + 1);
  counts.merge(key, 1, Integer::sum);
}
// percorra counts e fique com o primeiro de maior contagem (use >, não >=)
```

## Como o tester valida

- `1 2 3 1 2` → `1 2`;
- `5 6 7 8 7 8 5 6` → `5 6` (empate com `7 8`; `5 6` aparece primeiro);
- `9 9 9 1` → `9 9`;
- uma sequência aleatória.

## Dicas

- `LinkedHashMap` resolve o desempate de graça: a ordem de inserção é a ordem da
  primeira ocorrência.
- Os ids passam de 255 nos próximos stages: use `int`, não `byte`.
- Guarde esta função: o treino do stage 4 chama ela a cada iteração.

## Critério de conclusão

`pair` encontra o par mais frequente com o desempate correto.
