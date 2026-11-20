Arquivos `.torrent` e as respostas do tracker usam o formato **bencode**. O primeiro
comando do seu cliente decodifica um valor bencodado e imprime em JSON:

```bash
$ ./your_program.sh decode 5:hello
"hello"
```

## O que você vai aprender

- o bencode, um formato de serialização minimalista com só quatro tipos;
- por que strings bencodadas são prefixadas pelo **tamanho**: podem conter qualquer byte,
  inclusive `:` e dados binários.

## O formato

Uma string é `<tamanho>:<conteúdo>`, com o tamanho em bytes e em decimal:

| Bencode | Valor |
|---|---|
| `5:hello` | `"hello"` |
| `0:` | `""` |
| `11:hello world` | `"hello world"` |

## O que fazer

1. No comando `decode`, leia o número antes do `:`.
2. Pegue os próximos *tamanho* bytes depois do `:`.
3. Imprima como string JSON (entre aspas).

## Como o tester valida

- roda `decode` com strings aleatórias;
- faz o parse da saída como JSON e compara com o valor esperado.

## Dicas

- Trabalhe com **bytes** (`byte[]`), não com `String`: nos próximos stages as strings vão
  carregar hashes binários.
- Escreva o decoder com um cursor (posição atual): listas e dicionários vão chamá-lo
  recursivamente.

## Critério de conclusão

`decode` transforma strings bencodadas em strings JSON.
