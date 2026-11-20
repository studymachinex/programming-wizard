Implemente `cat-file -p <sha>`: leia um objeto **blob** de `.git/objects` e imprima o
seu conteúdo.

```bash
$ echo -n "hello world" > hello.txt
$ git hash-object -w hello.txt
95d09f2b10159347eece71399a7e2e907ea3df4f
$ /caminho/para/your_program.sh cat-file -p 95d09f2b10159347eece71399a7e2e907ea3df4f
hello world
```

## O que você vai aprender

- como o Git endereça conteúdo: o nome do arquivo é o SHA-1 do próprio conteúdo;
- o layout `objects/<2 primeiros caracteres>/<38 restantes>`;
- o formato de um objeto: `<tipo> <tamanho>\0<conteúdo>`, comprimido com zlib.

## O formato

Um blob com o conteúdo `hello world` é gravado assim, **antes** da compressão:

```text
blob 11\0hello world
```

- `blob` — o tipo do objeto;
- `11` — o tamanho do conteúdo em bytes, em decimal ASCII;
- `\0` — um byte nulo separando cabeçalho e conteúdo;
- `hello world` — o conteúdo, sem quebra de linha extra.

Esses bytes são comprimidos com zlib e salvos em
`.git/objects/95/d09f2b10159347eece71399a7e2e907ea3df4f`.

## O que fazer

1. Monte o caminho a partir do SHA: `sha.substring(0, 2)` é a pasta, o resto é o arquivo.
2. Descomprima com `java.util.zip.Inflater` (ou `InflaterInputStream`).
3. Encontre o primeiro byte `0`: tudo depois dele é o conteúdo.
4. Escreva o conteúdo em `System.out` **como bytes**, sem quebra de linha no final.

```java
byte[] compressed = Files.readAllBytes(Path.of(".git", "objects", sha.substring(0, 2), sha.substring(2)));
byte[] raw = new InflaterInputStream(new ByteArrayInputStream(compressed)).readAllBytes();
int nul = /* índice do primeiro 0 */;
System.out.write(raw, nul + 1, raw.length - nul - 1);
System.out.flush();
```

## Como o tester valida

- cria um repositório com o git real e grava um blob aleatório com `git hash-object -w`;
- roda `cat-file -p <sha>`;
- compara a saída **byte a byte** com o conteúdo original.

## Dicas

- Use `System.out.write(...)` em vez de `println`: o conteúdo não termina em `\n`.
- Não converta o conteúdo para `String` antes de imprimir — blobs podem ser binários.
- Lembre do `flush()` no final.

## Critério de conclusão

`cat-file -p` imprime exatamente o conteúdo do blob.
