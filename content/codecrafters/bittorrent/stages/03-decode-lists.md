Listas: `l<valores>e`, e os valores podem ser de qualquer tipo, inclusive outras listas.

```bash
$ ./your_program.sh decode l5:helloi52ee
["hello",52]
```

## O que você vai aprender

- a escrever um parser **recursivo** com um cursor compartilhado;
- que, no bencode, o fim de cada valor é determinado pelo próprio valor — não há separadores.

## O formato

| Bencode | Valor |
|---|---|
| `l5:helloi52ee` | `["hello", 52]` |
| `le` | `[]` |
| `lli4eei5ee` | `[[4], 5]` |

## O que fazer

1. Se o valor começar com `l`, avance o cursor.
2. Enquanto o próximo byte não for `e`, decodifique um valor (recursivamente) e adicione.
3. Consuma o `e` final.

```java
Object decode() {
  switch (data[pos]) {
    case 'l' -> {
      pos++;
      List<Object> list = new ArrayList<>();
      while (data[pos] != 'e') list.add(decode());
      pos++;
      return list;
    }
    // 'i', dígitos ...
  }
}
```

## Como o tester valida

- roda `decode` com listas simples, vazias e aninhadas;
- compara a saída (JSON) com o valor esperado.

## Critério de conclusão

`decode` entende listas aninhadas.
