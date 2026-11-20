Skills ficam bem mais úteis com **argumentos**:

```bash
$ ./your_program.sh -p "/traduzir README.md para o espanhol"
```

O texto depois do comando entra no lugar de `$ARGUMENTS` no corpo da skill:

```markdown
---
name: traduzir
description: Traduz um arquivo
---

Traduza o arquivo pedido: $ARGUMENTS. Preserve a formatação markdown.
```

## O que você vai aprender

- a parametrizar instruções com *templates*;
- a separar comando e argumentos no prompt.

## O que fazer

1. Separe o prompt em comando (`/traduzir`) e argumentos (o resto, sem espaços nas pontas).
2. Troque **todas** as ocorrências de `$ARGUMENTS` no corpo pelos argumentos.
3. Se o corpo não tiver `$ARGUMENTS` e houver argumentos, acrescente-os ao fim
   (ex.: `ARGUMENTS: ...`) para não perdê-los.

## Como o tester valida

- roda `-p "/<skill> <palavras aleatórias>"`;
- confere que a mensagem do usuário tem o corpo com os argumentos no lugar de `$ARGUMENTS`;
- confere que não sobrou nenhum `$ARGUMENTS` literal.

## Dicas

- Use `String.replace` (literal), não `replaceAll` (regex): `$` tem significado em regex.

## Critério de conclusão

Os argumentos do comando chegam ao corpo da skill.
