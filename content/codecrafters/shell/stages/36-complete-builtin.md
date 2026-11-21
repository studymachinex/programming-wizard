**Completação programável:** cada comando pode ter seu próprio programa de completação
(*completer*). `complete -C <programa> <nome>` registra que, ao completar argumentos de `<nome>`,
o shell deve perguntar ao `<programa>`.

## O que você vai aprender

- como shells permitem que ferramentas (git, docker...) tenham completação própria.

## O que fazer

Crie o builtin `complete` e guarde `nome → programa` num mapa ao receber `-C`.

## Como o tester valida

- `type complete` → builtin;
- `complete -C '<caminho do completer>' deploy` não imprime nada.

## Critério de conclusão

`complete -C` registra completers.
