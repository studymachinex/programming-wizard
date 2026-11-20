O jeito mais direto de usar uma skill é o usuário chamá-la pelo nome, como um comando:

```bash
$ ./your_program.sh -p "/changelog"
```

## O que você vai aprender

- *slash commands*: atalhos que expandem para instruções completas;
- que a expansão acontece **no agente**, antes de o modelo ver qualquer coisa.

## O que fazer

1. Se o prompt começar com `/<nome>` e existir uma skill com esse nome, troque o prompt pelo
   **corpo** do `SKILL.md` dela.
2. Envie o corpo como a mensagem `role: "user"`.
3. Se não existir skill com aquele nome, envie o prompt como está.

## Como o tester valida

- cria duas skills e roda `-p "/<nome-de-uma-delas>"`;
- confere que a mensagem do usuário contém o corpo do `SKILL.md` daquela skill.

## Dicas

- O corpo é tudo depois do frontmatter; tire espaços e linhas em branco das pontas.
- Prompts que começam com `/` mas não são skills (ex.: `/tmp/arquivo`) devem passar intactos.

## Critério de conclusão

`/<skill>` envia as instruções da skill ao modelo.
