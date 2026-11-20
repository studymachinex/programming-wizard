O último tipo: **dicionários**, `d<chave><valor>...e`.

```bash
$ ./your_program.sh decode d3:foo3:bar5:helloi52ee
{"foo":"bar","hello":52}
```

## O que você vai aprender

- que as chaves são strings e aparecem **ordenadas** (ordem de bytes);
- por que essa ordem importa: re-codificar um dicionário tem que gerar exatamente os mesmos
  bytes (stage 6).

## O formato

| Bencode | Valor |
|---|---|
| `d3:foo3:bar5:helloi52ee` | `{"foo": "bar", "hello": 52}` |
| `de` | `{}` |
| `d4:listl1:aee` | `{"list": ["a"]}` |

## O que fazer

1. Se o valor começar com `d`, leia pares (chave string, valor qualquer) até o `e`.
2. Guarde em um `Map` (um `TreeMap` mantém a ordem).
3. Imprima como objeto JSON.

## Como o tester valida

- roda `decode` com dicionários simples, vazios e aninhados em listas;
- compara a saída (JSON, a ordem das chaves não importa) com o valor esperado.

## Critério de conclusão

O decoder de bencode está completo.
