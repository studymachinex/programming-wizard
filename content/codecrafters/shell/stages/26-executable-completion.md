Além dos builtins, Tab completa nomes de **executáveis** do `PATH`.

## O que você vai aprender

- a listar diretórios e filtrar executáveis.

## O que fazer

Junte aos candidatos os executáveis de todos os diretórios do `PATH` (mesma regra do stage 7).
No Windows mostre o nome **sem** a extensão: `custom_ab12.cmd` aparece como `custom_ab12`.

## Como o tester valida

- cria `custom_<id>` num diretório do `PATH`;
- digita `custo` + Tab → `$ custom_<id> `;
- Enter executa o programa.

## Dicas

- Use um `TreeSet` para eliminar repetições (o mesmo nome em dois diretórios) e já ordenar.

## Critério de conclusão

Tab completa executáveis.
