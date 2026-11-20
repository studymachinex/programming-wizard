Implemente `ls-tree --name-only <tree_sha>`: leia um objeto **tree** e imprima o nome de
cada entrada, uma por linha.

```bash
$ /caminho/para/your_program.sh ls-tree --name-only a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
dir1
dir2
file1.txt
```

## O que você vai aprender

- como o Git representa diretórios: uma tree é uma lista de entradas que apontam para
  blobs (arquivos) ou outras trees (subdiretórios);
- a diferença entre um formato textual e um formato **binário**;
- por que o SHA dentro da tree ocupa 20 bytes e não 40.

## O formato

Depois de descomprimir e remover o cabeçalho `tree <tamanho>\0`, o conteúdo é uma
sequência de entradas, sem separador entre elas:

```text
<modo> <nome>\0<sha de 20 bytes><modo> <nome>\0<sha de 20 bytes>...
```

- `<modo>` — ASCII: `100644` (arquivo), `100755` (executável), `120000` (symlink) ou
  `40000` (diretório; sem o zero à esquerda);
- `<nome>` — o nome do arquivo ou diretório;
- `\0` — byte nulo;
- `<sha>` — os 20 bytes **brutos** do SHA-1, não a versão hexadecimal.

As entradas já vêm ordenadas por nome.

## O que fazer

1. Reaproveite o `readObject` do stage 2 e confira que o tipo é `tree`.
2. Percorra o conteúdo: leia até o espaço (modo), até o `\0` (nome) e então 20 bytes (SHA).
3. Imprima cada nome em uma linha.

```java
int i = 0;
while (i < data.length) {
  int space = indexOf(data, (byte) ' ', i);
  int nul = indexOf(data, (byte) 0, space);
  String name = new String(data, space + 1, nul - space - 1, StandardCharsets.UTF_8);
  System.out.println(name);
  i = nul + 1 + 20;
}
```

## Como o tester valida

- cria arquivos e diretórios aleatórios e grava a tree com `git add` + `git write-tree`;
- roda `ls-tree --name-only <sha>`;
- compara a lista de nomes, na mesma ordem, com a do `git ls-tree --name-only`.

## Dicas

- Não procure o próximo `\0` depois do SHA: os 20 bytes binários podem conter zeros.
- `HexFormat.of().formatHex(data, nul + 1, nul + 21)` converte o SHA se você quiser
  implementar o `ls-tree` completo (`<modo> <tipo> <sha>\t<nome>`).
- Só a tree do nível pedido é listada; não desça nos subdiretórios.

## Critério de conclusão

A saída tem os mesmos nomes, na mesma ordem, que `git ls-tree --name-only`.
