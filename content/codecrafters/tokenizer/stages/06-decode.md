O caminho de volta: implemente `decode <arquivo_merges>`, que transforma ids do stdin
de volta no texto original.

```bash
$ echo "258 100 258 97 99" | ./your_program.sh decode merges.txt
aaabdaaabac
```

## O que você vai aprender

- que todo token é, no fundo, uma sequência de bytes;
- a montar a tabela `id → bytes` a partir dos merges;
- por que um token pode conter **meio** caractere — e por que decodificar só no final.

## O que fazer

1. Monte o vocabulário: `vocab[b] = [b]` para `b` de `0` a `255`.
2. Para cada merge `a b -> id`, **na ordem do arquivo**:
   `vocab[id] = vocab[a] + vocab[b]`.
3. Concatene os bytes de cada id do stdin.
4. Escreva os bytes **crus** na saída, sem quebra de linha no final.

```java
Map<Integer, byte[]> vocab = new HashMap<>();
for (int b = 0; b < 256; b++) vocab.put(b, new byte[] {(byte) b});
for (Merge m : merges) vocab.put(m.id(), concat(vocab.get(m.a()), vocab.get(m.b())));
// junte os bytes de todos os ids e então OUT.write(bytes)
```

## Como o tester valida

- treina merges, codifica um texto com a referência e passa os ids para o seu `decode`;
- compara a saída **byte a byte** com o texto original, incluindo acentos e emojis.

## Dicas

- Junte todos os bytes **antes** de converter para texto: um emoji pode estar dividido
  entre dois tokens, e cada pedaço sozinho é UTF-8 inválido.
- Use `OUT.write(bytes)`, não `println`.
- A ordem do arquivo garante que `vocab[a]` e `vocab[b]` já existem quando você chega ao
  merge que os usa.

## Critério de conclusão

`decode(encode(texto)) == texto`, byte a byte.
