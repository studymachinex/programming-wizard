Se o BPE rodar sobre o texto inteiro, ele pode juntar o fim de uma palavra com a
pontuação seguinte (`dog.` vira um token) e o vocabulário se enche de combinações
inúteis. O GPT-2 resolve isso com uma **pré-tokenização**: uma regex corta o texto em
pedaços, e os merges nunca atravessam a fronteira entre eles.

Implemente `split`: imprima os pedaços do texto do stdin, um por linha, como string JSON.

```bash
$ printf "Hello world, I'm here!" | ./your_program.sh split
"Hello"
" world"
","
" I"
"'m"
" here"
"!"
```

## O que você vai aprender

- por que tokenizers reais separam palavras, números e pontuação antes do BPE;
- regex com classes Unicode: `\p{L}` (letras de qualquer língua) e `\p{N}` (números);
- o papel do espaço **antes** da palavra (`" world"`) no vocabulário do GPT-2.

## A regex

```text
's|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+
```

Lida da esquerda para a direita, a primeira alternativa que casa vence:

| Trecho | Casa com |
|---|---|
| `'s\|'t\|'re\|...` | contrações do inglês |
| ` ?\p{L}+` | uma palavra, opcionalmente com um espaço antes |
| ` ?\p{N}+` | um número |
| ` ?[^\s\p{L}\p{N}]+` | pontuação e símbolos |
| `\s+(?!\S)` | espaços que **não** precedem uma palavra |
| `\s+` | o resto dos espaços |

O penúltimo item faz `"a   b"` virar `"a"`, `"  "`, `" b"`: o último espaço fica com a
palavra seguinte.

## O que fazer

1. Compile a regex com `Pattern.UNICODE_CHARACTER_CLASS`.
2. Use `matcher.find()` em loop e colete `matcher.group()`.
3. Imprima cada pedaço como string JSON: entre aspas, escapando `"`, `\`, `\n`, `\r`,
   `\t` e outros caracteres de controle (`\u00XX`).

```java
Pattern pattern = Pattern.compile(
    "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+",
    Pattern.UNICODE_CHARACTER_CLASS);
Matcher matcher = pattern.matcher(text);
while (matcher.find()) OUT.println(jsonString(matcher.group()));
```

## Como o tester valida

- roda `split` com textos com contrações, números, pontuação repetida, espaços
  múltiplos, quebras de linha, tabs, acentos e emojis;
- faz o parsing de cada linha como JSON e compara a lista de pedaços com a referência.

## Dicas

- Sem `UNICODE_CHARACTER_CLASS`, o `\s` do Java só reconhece espaços ASCII.
- Juntar todos os pedaços tem que devolver o texto original — bom teste para você.
- Caracteres fora do ASCII (acentos, emojis) podem ir direto na string JSON, em UTF-8.

## Critério de conclusão

`split` corta o texto exatamente nos mesmos pedaços que a regex do GPT-2.
