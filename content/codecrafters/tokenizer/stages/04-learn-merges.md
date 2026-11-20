Treinar um tokenizer BPE é repetir os dois stages anteriores. Implemente
`train <vocab_size>`: aprenda merges a partir do texto do stdin até o vocabulário ter
`vocab_size` tokens.

```bash
$ printf 'aaabdaaabac' | ./your_program.sh train 259
97 97 -> 256
256 97 -> 257
257 98 -> 258
```

## O que você vai aprender

- como um vocabulário de tokens é **aprendido** de um corpus, não escrito à mão;
- por que palavras comuns viram um token só e palavras raras ficam quebradas;
- que o resultado do treino é só uma lista ordenada de merges.

## O que fazer

1. Converta o texto em bytes (stage 1): os ids `0`–`255`.
2. Para cada novo id, de `256` até `vocab_size - 1`:
   - encontre o par mais frequente (stage 2);
   - substitua o par pelo novo id (stage 3);
   - registre o merge `a b -> id`.
3. Pare antes se a sequência tiver menos de 2 tokens.
4. Imprima os merges na ordem em que foram aprendidos, um por linha.

```java
for (int id = 256; id < vocabSize && ids.size() >= 2; id++) {
  int[] pair = mostFrequentPair(ids);
  ids = merge(ids, pair[0], pair[1], id);
  OUT.println(pair[0] + " " + pair[1] + " -> " + id);
}
```

## Como o tester valida

- treina com um texto aleatório de ~180 palavras (com acentos e emojis) e
  `vocab_size = 296` (40 merges);
- compara cada linha com a referência, na ordem.

## Dicas

- O desempate do stage 2 é o que torna o treino determinístico: sem ele, dois
  treinos do mesmo texto podem divergir.
- Os merges podem combinar tokens já mesclados (`256 97 -> 257`): é assim que surgem
  tokens de palavras inteiras.
- Este formato (`a b -> id`) é o que os stages 5 e 6 recebem como arquivo.

## Critério de conclusão

A lista de merges é idêntica à da referência para o mesmo texto e tamanho.
