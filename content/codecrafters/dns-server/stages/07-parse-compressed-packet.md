Um pacote DNS pode ter **várias perguntas**, e os nomes podem vir **comprimidos**. Neste
stage, responda a todas as perguntas, entendendo os dois formatos de nome.

## O que você vai aprender

- a compressão de nomes do DNS: ponteiros para trechos já escritos no pacote;
- por que os dois bits altos do byte de tamanho são reservados;
- a seguir ponteiros sem cair em loops.

## O formato

Nomes repetem sufixos com frequência (`a.exemplo.com`, `b.exemplo.com`). Em vez de
repetir `exemplo.com`, o pacote pode apontar para onde ele já apareceu.

Ao ler o byte de tamanho de um label:

- se os dois bits altos forem `00`, é um label normal (tamanho de 0 a 63);
- se forem `11`, é um **ponteiro** de 2 bytes: os 14 bits restantes são o offset, a partir
  do início do pacote, onde o nome continua.

```text
offset 12: \x03abc\x07exemplo\x03com\x00   ← primeira question: abc.exemplo.com
           ...TYPE e CLASS...
offset 33: \x03def\xC0\x10                 ← segunda: "def" + ponteiro para o offset 16
```

`\xC0\x10` = `11000000 00010000` → ponteiro para o offset `16`, onde começa
`\x07exemplo\x03com\x00`. A segunda question é, portanto, `def.exemplo.com`.

## O que fazer

1. Leia `QDCOUNT` e faça o parsing de todas as questions.
2. No `readName`, trate ponteiros: ao encontrar `11xxxxxx`, pule para o offset indicado e
   continue lendo os labels de lá.
3. Depois de um ponteiro, o nome **termina**: o cursor da seção avança só os 2 bytes do
   ponteiro, não os labels lidos no destino.
4. Responda com todas as questions (sem compressão) e uma answer para cada.

```java
if ((length & 0xc0) == 0xc0) {
  int pointer = ((length & 0x3f) << 8) | (data[cursor + 1] & 0xff);
  if (!jumped) offset[0] = cursor + 2; // a seção continua depois do ponteiro
  jumped = true;
  cursor = pointer;
  continue;
}
```

## Como o tester valida

- envia um pacote com 2 questions; a segunda usa um ponteiro para o sufixo da primeira;
- confere `QDCOUNT = 2` e os dois nomes, por extenso e na ordem;
- confere `ANCOUNT = 2`, com uma answer válida para cada nome.

## Dicas

- Na resposta, escreva os nomes por extenso: comprimir é opcional e mais trabalhoso.
- Limite a quantidade de saltos (ex.: 32) para não travar com um pacote malicioso.
- Um nome pode ter labels normais **e** terminar com um ponteiro — trate os dois no mesmo loop.

## Critério de conclusão

O servidor responde a várias perguntas por pacote, inclusive com nomes comprimidos.
