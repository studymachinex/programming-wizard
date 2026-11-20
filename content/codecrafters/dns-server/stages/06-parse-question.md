Pare de responder sempre `programming.wizard`: leia a **question do request** e responda
para o nome que foi perguntado.

## O que você vai aprender

- a decodificar labels: o inverso do `encodeName` do stage 3;
- a manter um cursor (offset) ao percorrer um pacote binário;
- por que o parser precisa saber onde cada seção termina.

## O que fazer

1. A question começa no byte 12, logo depois do header.
2. Leia o nome: um byte de tamanho, o label, outro byte de tamanho... até um byte `0`.
3. Leia TYPE e CLASS (2 bytes cada) logo depois do nome.
4. Use o nome lido na question **e** na answer da resposta.

```java
static String readName(byte[] data, int[] offset) {
  List<String> labels = new ArrayList<>();
  int length;
  while ((length = data[offset[0]] & 0xff) != 0) {
    labels.add(new String(data, offset[0] + 1, length, StandardCharsets.US_ASCII));
    offset[0] += 1 + length;
  }
  offset[0] += 1; // o byte 0 final
  return String.join(".", labels);
}
```

## Como o tester valida

- envia uma consulta para um nome aleatório (ex.: `potion.dragon.com`);
- confere `QDCOUNT = 1` e a question com esse nome;
- confere `ANCOUNT = 1` e a answer com esse mesmo nome, TYPE `1`, CLASS `1` e RDLENGTH `4`.

## Dicas

- Um `int[]` de um elemento é um jeito simples de passar o cursor por referência em Java.
- A answer ainda pode usar um IP fixo (`8.8.8.8`).
- Continue copiando o header como no stage anterior.

## Critério de conclusão

O servidor responde para qualquer nome perguntado, não só para um nome fixo.
