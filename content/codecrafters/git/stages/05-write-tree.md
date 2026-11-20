Implemente `write-tree`: grave o diretório atual inteiro como objetos (blobs para os
arquivos, trees para os diretórios) e imprima o SHA da tree raiz.

```bash
$ /caminho/para/your_program.sh write-tree
a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
```

O git real usa a *staging area* (index). Aqui, para simplificar, você grava o que está no
working tree, como se tudo tivesse passado por `git add -A`.

## O que você vai aprender

- como uma árvore de diretórios vira uma árvore de objetos — de baixo para cima;
- por que mudar um arquivo muda o SHA de todos os diretórios acima dele;
- a regra de ordenação do Git e o motivo de diretórios vazios não existirem no Git.

## O que fazer

Uma função recursiva `writeTree(dir)`:

1. Liste as entradas do diretório, **ignorando `.git`**.
2. Para cada arquivo: grave como blob (stage 3) e gere a entrada `100644 <nome>\0<sha>`.
3. Para cada subdiretório: chame `writeTree` recursivamente e gere `40000 <nome>\0<sha>`.
4. Ordene as entradas e concatene.
5. Grave como objeto `tree` e devolva o SHA.

```java
String writeTree(Path dir) {
  // ... para cada filho (ordenado):
  tree.write((mode + " " + name + "\0").getBytes(UTF_8));
  tree.write(HexFormat.of().parseHex(childSha)); // 20 bytes brutos
  // ...
  return writeObject("tree", tree.toByteArray());
}
```

## Como o tester valida

- cria arquivos e diretórios aleatórios (incluindo um diretório vazio) em um repositório novo;
- roda `write-tree` e confere que a tree e todos os objetos que ela referencia foram gravados;
- roda `git add -A` + `git write-tree` e compara os SHAs.

## Dicas

- **Ordenação:** o Git compara nomes byte a byte, mas trata um diretório como se o nome
  terminasse em `/`. Por isso `foo.txt` vem antes de `foo/` (`.` < `/`).
- **Diretórios vazios** não geram entrada: se a tree ficaria vazia, não a inclua no pai.
- O SHA na entrada é **binário** (20 bytes), como você leu no stage 4.
- No Windows, use sempre `100644`; em Linux/macOS, arquivos executáveis usam `100755`.

## Critério de conclusão

O SHA impresso é idêntico ao que o git real gera para o mesmo diretório.
