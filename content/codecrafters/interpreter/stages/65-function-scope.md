Parâmetros sombreiam globais; variáveis locais não existem fora da função; funções podem
alterar globais.

## O que você vai aprender

- o escopo de uma chamada.

## O que fazer

Confira que o ambiente da chamada é filho do ambiente certo.

## Como o tester valida

- sombreamento por parâmetro, acumulador global, local inacessível de fora (70).

## Dicas

- Erros de execução: imprima a mensagem no stderr e, na linha seguinte, `[line N]`; termine com código **70**.

## Critério de conclusão

Escopo de função funciona.
