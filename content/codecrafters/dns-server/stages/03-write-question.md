Depois do header vem a **question section**: a pergunta que está sendo respondida. Neste
stage, inclua uma question para o nome `programming.wizard`.

## O que você vai aprender

- como o DNS codifica nomes de domínio em **labels** com prefixo de tamanho;
- os campos TYPE e CLASS;
- por que a resposta repete a pergunta.

## O formato

Um nome como `programming.wizard` vira uma sequência de labels, cada uma precedida
por um byte com o seu tamanho, terminando em um byte `0`:

```text
\x0bprogramming\x06wizard\x00
```

- `\x0b` = 11, o tamanho de `programming`;
- `\x06` = 6, o tamanho de `wizard`;
- `\x00` = fim do nome (o label vazio da raiz).

Em seguida, dois campos de 2 bytes:

| Campo | Valor | Significado |
|---|---|---|
| TYPE | `1` | registro A (endereço IPv4) |
| CLASS | `1` | IN (internet) |

## O que fazer

1. Escreva a question logo depois do header: nome codificado + TYPE `1` + CLASS `1`.
2. Atualize `QDCOUNT` para `1` no header.

```java
static byte[] encodeName(String name) {
  ByteArrayOutputStream out = new ByteArrayOutputStream();
  for (String label : name.split("\\.")) {
    out.write(label.length());
    out.writeBytes(label.getBytes(StandardCharsets.US_ASCII));
  }
  out.write(0);
  return out.toByteArray();
}
```

## Como o tester valida

- envia uma consulta para `programming.wizard`;
- confere `QDCOUNT = 1`;
- confere que a question tem nome `programming.wizard`, TYPE `1` e CLASS `1`.

## Dicas

- Não escreva os pontos: o tamanho de cada label já separa as partes.
- Um label tem no máximo 63 bytes — os dois bits altos do byte de tamanho têm outro uso
  (você vai ver isso no stage 7).
- Neste stage o nome é fixo; no stage 6 você passa a ler o nome do request.

## Critério de conclusão

A resposta contém uma question válida para `programming.wizard`.
