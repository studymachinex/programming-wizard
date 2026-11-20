Algumas tarefas são melhor resolvidas por código determinístico do que pelo modelo:
contar, validar, formatar. Uma skill pode trazer **scripts** na própria pasta, e as
instruções dizem ao modelo como rodá-los:

```text
.agent/skills/contar-linhas/
  SKILL.md
  scripts/
    count.mjs
```

```markdown
---
name: contar-linhas
description: Conta as linhas de um arquivo
---

Conte as linhas executando: node "${SKILL_DIR}/scripts/count.mjs" $ARGUMENTS
```

## O que você vai aprender

- a combinar o raciocínio do modelo com ferramentas determinísticas;
- por que caminhos relativos quebram (o comando roda no diretório do projeto, não no da skill).

## O que fazer

1. Ao renderizar o corpo de uma skill, troque `${SKILL_DIR}` pelo **caminho absoluto** da
   pasta da skill.
2. O modelo lê as instruções e chama `bash` com o comando — a ferramenta do stage 6 já resolve.

## Como o tester valida

- cria uma skill com um script Node que conta as linhas de um arquivo;
- roda `-p "/<skill> data.txt"`;
- o modelo pega o comando das instruções e chama `bash` com ele;
- confere que `${SKILL_DIR}` foi substituído e que o resultado tem a saída do script.

## Dicas

- No Windows, troque `\` por `/` no caminho: o Node aceita, e as aspas continuam funcionando.
- O caminho pode ter espaços — por isso o corpo usa aspas em volta dele.

## Critério de conclusão

O modelo consegue executar scripts que vêm junto com a skill.
