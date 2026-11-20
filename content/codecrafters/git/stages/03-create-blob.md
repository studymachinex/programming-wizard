Implemente `hash-object -w <arquivo>`: calcule o SHA-1 do arquivo como blob, grave o
objeto em `.git/objects` e imprima o SHA.

```bash
$ echo "hello world" > hello.txt
$ /caminho/para/your_program.sh hash-object -w hello.txt
3b18e512dba79e4c8300dd08aeb37f8e728b8dad
$ git cat-file -p 3b18e512dba79e4c8300dd08aeb37f8e728b8dad
hello world
```

## O que você vai aprender

- o caminho inverso do stage anterior: cabeçalho → hash → compressão → disco;
- por que o SHA é calculado sobre o objeto **com cabeçalho e antes** da compressão;
- como o endereçamento por conteúdo deduplica arquivos idênticos.

## O que fazer

1. Leia os bytes do arquivo.
2. Monte `blob <tamanho>\0<conteúdo>`.
3. Calcule o SHA-1 desses bytes e converta para hexadecimal minúsculo (40 caracteres).
4. Comprima os mesmos bytes com zlib e grave em `.git/objects/<xx>/<resto>`.
5. Imprima o SHA seguido de quebra de linha.

```java
byte[] content = Files.readAllBytes(Path.of(file));
byte[] header = ("blob " + content.length + "\0").getBytes(StandardCharsets.UTF_8);
byte[] full = /* header + content */;
String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(full));
// DeflaterOutputStream para comprimir e gravar em .git/objects/sha[0..2]/sha[2..]
```

## Como o tester valida

- cria um arquivo aleatório em um repositório novo;
- roda `hash-object -w <arquivo>`;
- compara o SHA impresso com o de `git hash-object`;
- confere que o arquivo do objeto existe e que `git cat-file -p` consegue lê-lo.

## Dicas

- Crie a pasta `.git/objects/<xx>` antes de gravar (`Files.createDirectories`).
- Sem a flag `-w`, o git só calcula o hash. Suportar os dois casos é simples e útil.
- Isole as funções `writeObject(type, bytes)` e `readObject(sha)`: elas serão usadas em
  todos os próximos stages.

## Critério de conclusão

O SHA bate com o do git real e o objeto gravado é legível por ele.
