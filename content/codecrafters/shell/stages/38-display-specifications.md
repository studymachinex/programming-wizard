Com registro, `complete -p` imprime o comando que recriaria aquele registro.

## O que você vai aprender

- um padrão comum em shells: imprimir o estado como comandos reexecutáveis.

## O que fazer

Imprima `complete -C '<programa>' <nome>`.

## Como o tester valida

- registra `deploy` e `backup` com completers diferentes;
- `complete -p deploy`, `complete -p backup` e `complete -p restore` (sem registro).

## Dicas

- Formato do registro mostrado por `complete -p`: `complete -C '<comando>' <nome>` — o comando entre aspas simples, exatamente como foi registrado.

## Critério de conclusão

`complete -p` mostra os registros.
