Se a variável de ambiente `HISTFILE` estiver definida, o shell carrega esse arquivo ao
iniciar — é assim que o histórico sobrevive entre sessões.

## O que você vai aprender

- configuração por variáveis de ambiente.

## O que fazer

Na inicialização, se `HISTFILE` existir e o arquivo também, carregue as linhas.

## Como o tester valida

- `HISTFILE` com dois comandos; `history` mostra os dois e depois o `history`.

## Dicas

- Formato do `history`: número alinhado à direita em 5 colunas, dois espaços e o comando — `String.format("%5d  %s", n, comando)`.

## Critério de conclusão

O histórico é carregado ao iniciar.
