Às vezes uma tarefa combina skills: pesquisar **e** resumir, revisar **e** gerar
changelog. Permita vários comandos no mesmo prompt:

```bash
$ ./your_program.sh -p "/pesquisar /resumir arquitetura hexagonal"
```

## O que você vai aprender

- a compor instruções em vez de duplicá-las em uma skill gigante;
- a fazer o parse de uma sequência de comandos.

## O que fazer

1. Enquanto o próximo token do prompt for `/<nome>` de uma skill existente, consuma-o.
2. O que sobrar são os argumentos, compartilhados por todas as skills.
3. Monte a mensagem do usuário com os corpos **na ordem dos comandos**, cada um com
   `$ARGUMENTS` substituído, separados por uma linha em branco.

```text
/pesquisar /resumir arquitetura hexagonal
→ corpo de pesquisar (com "arquitetura hexagonal")
→ (linha em branco)
→ corpo de resumir (com "arquitetura hexagonal")
```

## Como o tester valida

- roda `-p "/<a> /<b> <argumento>"`;
- confere que a mensagem tem os dois corpos com o argumento, e o de `<a>` antes do de `<b>`.

## Dicas

- Pare no primeiro token que não é uma skill: ele e o resto são argumentos.

## Critério de conclusão

Vários comandos de skill no mesmo prompt são expandidos em ordem.
