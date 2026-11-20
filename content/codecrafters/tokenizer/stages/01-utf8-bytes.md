Modelos de linguagem não leem letras: leem **tokens**, números inteiros. Neste desafio
você vai construir o algoritmo que faz essa conversão, o BPE. Tudo começa nos bytes.

O tester executa o seu programa com um comando como primeiro argumento e a entrada no
**stdin**:

```bash
$ printf 'Olá' | ./your_program.sh bytes
79 108 195 161
```

## O que você vai aprender

- a diferença entre caractere, *code point* e byte;
- por que `á` vira **dois** bytes em UTF-8 e um emoji vira **quatro**;
- por que tokenizers modernos começam dos bytes: qualquer texto do mundo cabe em 256
  símbolos iniciais, sem "palavra desconhecida".

## O que fazer

1. Leia todo o stdin como bytes (`System.in.readAllBytes()`).
2. Imprima cada byte como número de `0` a `255`, separados por espaço, em uma linha.

```java
byte[] input = System.in.readAllBytes();
StringBuilder out = new StringBuilder();
for (byte b : input) {
  if (out.length() > 0) out.append(' ');
  out.append(b & 0xff);
}
OUT.println(out);
```

## Como o tester valida

- roda `bytes` com textos em inglês, português, emojis e um texto aleatório;
- compara a sua lista de números com os bytes UTF-8 esperados.

## Dicas

- `byte` em Java tem sinal (−128 a 127). `b & 0xff` converte para 0–255.
- Não converta a entrada para `String` antes: ela já chega em UTF-8.
- O starter já define `OUT` como saída UTF-8; use-o nos próximos stages também.

## Critério de conclusão

`bytes` imprime exatamente a codificação UTF-8 da entrada.
