`${NOME}` delimita o nome explicitamente — útil quando o texto seguinte continua com
letras: `${item}s`.

## O que você vai aprender

- por que a forma com chaves existe.

## O que fazer

Se depois do `$` vier `{`, o nome vai até o `}`.

## Como o tester valida

- `echo ${item}s`;
- `echo "pre_${item}_pos"`;
- `echo '${item}'` → literal.

## Critério de conclusão

`${NOME}` é expandido.
