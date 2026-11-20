Agora os **inteiros**: `i<número>e`.

```bash
$ ./your_program.sh decode i52e
52
$ ./your_program.sh decode i-52e
-52
```

## O que você vai aprender

- a distinguir o tipo de um valor bencodado pelo primeiro caractere;
- por que tamanhos de arquivo exigem `long` (arquivos passam de 2 GiB).

## O formato

`i`, o número em decimal (pode ser negativo) e `e`:

| Bencode | Valor |
|---|---|
| `i52e` | `52` |
| `i-52e` | `-52` |
| `i4294967300e` | `4294967300` |

## O que fazer

1. Se o valor começar com `i`, leia até o próximo `e` e converta com `Long.parseLong`.
2. Se começar com um dígito, é uma string (stage 1).
3. Imprima o número como JSON (sem aspas).

## Como o tester valida

- roda `decode` com um positivo, um negativo e um maior que 2³²;
- compara a saída (JSON) com o valor esperado.

## Dicas

- Use `long` desde já.
- Faça o decoder devolver `Object` (`Long`, `byte[]`, `List`, `Map`) e escreva uma função
  separada que converte o resultado para JSON.

## Critério de conclusão

`decode` entende strings e inteiros.
