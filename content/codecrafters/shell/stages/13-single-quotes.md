Até aqui, separar por espaços bastava. Mas como passar um argumento **com** espaços? Com
aspas. Entre aspas simples tudo é literal — espaços, `\`, `"`, `$`.

```
$ echo 'manga     azul'
manga     azul
$ echo 'manga''azul' manga''azul
mangaazul mangaazul
```

## O que você vai aprender

- a escrever um tokenizador com estados (fora/dentro de aspas);
- que aspas não fazem parte da palavra — só delimitam.

## O que fazer

Troque o `split(" ")` por um laço caractere a caractere:

- fora de aspas, espaço termina a palavra atual (espaços repetidos não geram palavras vazias);
- `'` entra no modo literal até o próximo `'`;
- texto colado forma uma palavra só: `'abc''def'` e `abc''def` viram `abcdef`.

## Como o tester valida

- `echo '<a>     <b>'` preserva os espaços;
- `echo '<a>''<b>' <a>''<b>`;
- `echo <a>     <b>` (sem aspas) junta em um espaço;
- `echo '"azul"  \n'` mantém tudo literal;
- `cat '<arquivo com espaço>' '<outro>'`.

## Dicas

- Uma palavra vazia entre aspas (`''`) **é** um argumento — guarde um indicador "esta palavra teve aspas".

## Critério de conclusão

Aspas simples funcionam.
