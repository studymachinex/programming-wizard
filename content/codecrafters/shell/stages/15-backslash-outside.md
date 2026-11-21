Fora de aspas, a barra invertida **escapa** o próximo caractere: ele vira texto literal, seja
espaço, aspa ou outra barra. A barra em si desaparece.

## O que você vai aprender

- o terceiro mecanismo de quoting do shell.

## O que fazer

Fora de aspas, ao ver `\`, adicione o caractere seguinte à palavra e pule os dois.

## Como o tester valida

- `echo a\ \ \ b` → `a   b`;
- `echo \'x\' \"y\"` → `'x' "y"`;
- `echo a\nb` → `anb` (não é quebra de linha!);
- `echo \\x` → `\x`;
- `cat arquivo\ com\ espacos`.

## Critério de conclusão

Barras invertidas fora de aspas funcionam.
