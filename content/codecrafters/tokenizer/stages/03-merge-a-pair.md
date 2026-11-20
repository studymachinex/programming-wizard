Encontrado o par, o BPE o substitui por um **token novo**. Implemente
`merge <a> <b> <id>`: troque cada ocorrência do par `(a, b)` por `id`.

```bash
$ echo "1 2 3 1 2" | ./your_program.sh merge 1 2 256
256 3 256
```

## O que você vai aprender

- que um token novo é só um número que representa "a seguido de b";
- a substituir pares em uma passada, sem sobreposição;
- por que a sequência encolhe a cada merge — é isso que comprime o texto.

## O que fazer

1. Leia `a`, `b` e `id` dos argumentos e os ids do stdin.
2. Percorra da esquerda para a direita:
   - se `ids[i] == a` e `ids[i+1] == b`, escreva `id` e avance **2** posições;
   - senão, copie `ids[i]` e avance 1.
3. Imprima a nova sequência.

```java
List<Integer> out = new ArrayList<>();
int i = 0;
while (i < ids.size()) {
  if (i + 1 < ids.size() && ids.get(i) == a && ids.get(i + 1) == b) {
    out.add(id);
    i += 2;
  } else {
    out.add(ids.get(i++));
  }
}
```

## Como o tester valida

- `1 2 3 1 2` com `merge 1 2 256` → `256 3 256`;
- `7 7 7 7 7` com `merge 7 7 300` → `300 300 7` (sem sobreposição);
- outros casos, incluindo uma sequência aleatória.

## Dicas

- Compare `Integer` com `==` só para valores pequenos; prefira `.equals` ou `int`.
  (Para ids acima de 127, `Integer == Integer` compara referências!)
- O novo token não é procurado de novo na mesma passada: `7 7 7 7` vira `300 300`, não
  um token de quatro setes.

## Critério de conclusão

`merge` substitui todas as ocorrências do par, da esquerda para a direita.
