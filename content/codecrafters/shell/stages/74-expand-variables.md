`$NOME` em qualquer comando é substituído pelo valor da variável (do shell ou de ambiente).
A expansão acontece fora de aspas e dentro de aspas **duplas**, mas não dentro de aspas simples.
`\$` é um cifrão literal, e um `$` que não é seguido de nome também.

## O que você vai aprender

- que expansão acontece durante a tokenização, respeitando o quoting.

## O que fazer

No tokenizador, ao ver `$` seguido de um caractere de nome, leia o nome inteiro e acrescente o
valor à palavra atual. Procure primeiro nas variáveis do shell, depois no ambiente.

## Como o tester valida

- `echo minha cor: $cor`;
- `echo "cor=$cor fruta=$PW_FRUTA"`;
- `echo '$cor'` → literal;
- `echo \$cor custa $` → `$cor custa $`.

## Dicas

- Não é preciso fazer *word splitting* (dividir o valor expandido em várias palavras): os testes usam valores sem espaços fora de aspas.

## Critério de conclusão

`$NOME` é expandido.
