Aspas duplas também preservam espaços, mas não são totalmente literais: dentro delas `\`
e `$` têm significado especial (stages 17 e 74). Aspas simples dentro de duplas são texto comum.

```
$ echo "it's" "azul's"
it's azul's
$ echo "kiwi"roxo'x'
kiwiroxox
```

## O que você vai aprender

- a combinar vários modos de quoting numa mesma palavra.

## O que fazer

Adicione o estado "dentro de aspas duplas" ao tokenizador. Por enquanto, tudo até o próximo `"`
é literal.

## Como o tester valida

- `echo "<a>    <b>"`;
- `echo "it's" "<cor>'s"`;
- `echo "<a>"<b>'x'` → uma palavra só;
- `cat "<arquivo com ' e espaços>"`.

## Critério de conclusão

Aspas duplas funcionam.
