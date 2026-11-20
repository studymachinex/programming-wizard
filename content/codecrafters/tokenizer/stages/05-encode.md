Com os merges aprendidos, qualquer texto pode ser **codificado** em tokens. Implemente
`encode <arquivo_merges>`: leia os merges do arquivo e codifique o texto do stdin.

```bash
$ printf 'aaabdaaabac' | ./your_program.sh encode merges.txt
258 100 258 97 99
```

O arquivo tem o formato do stage 4, um merge por linha:

```text
97 97 -> 256
256 97 -> 257
257 98 -> 258
```

## O que você vai aprender

- que codificar **não** é treinar de novo: os merges já estão decididos;
- por que a **ordem** dos merges importa — um merge só existe depois dos que o formam;
- a diferença entre "o par mais frequente" (treino) e "o merge mais antigo" (encode).

## O que fazer

1. Leia o arquivo e monte um mapa `(a, b) → id`.
2. Converta o texto em bytes.
3. Repita enquanto houver pelo menos 2 tokens:
   - entre todos os pares adjacentes que existem no mapa, escolha o de **menor id**
     (o aprendido primeiro);
   - se nenhum par estiver no mapa, pare;
   - aplique o merge (stage 3).
4. Imprima os ids.

```java
while (ids.size() >= 2) {
  // encontre o par (ids[i], ids[i+1]) presente em ranks com o menor id
  // se não houver nenhum, break
  ids = merge(ids, bestA, bestB, bestId);
}
```

## Como o tester valida

- treina merges com um texto aleatório e grava em um arquivo temporário;
- roda `encode <arquivo>` com outros textos (com e sem acentos);
- compara os ids com a referência.

## Dicas

- Não escolha o par mais frequente do texto a codificar: use **só** a ordem dos merges.
- Um mapa com chave `long` (`a << 32 | b`) evita criar strings para cada par.
- Ignore linhas vazias no arquivo de merges.

## Critério de conclusão

`encode` produz os mesmos tokens que a referência para os mesmos merges.
