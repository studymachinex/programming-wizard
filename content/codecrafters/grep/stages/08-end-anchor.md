`$` casa com o **fim** da linha: `dog$` casa com `hotdog`, mas não com `dogs`.

## O que você vai aprender

- a combinar as duas âncoras: `^abc$` exige a linha inteira.

## O que fazer

`$` casa somente quando a posição atual é o fim da linha.

## Como o tester valida

- `<fruta>$`, `^<fruta>$` com entradas que terminam ou não na fruta.

## Dicas

- Lembre: a linha é o texto sem o `\n` final.

## Critério de conclusão

`$` restringe o match ao fim da linha.
