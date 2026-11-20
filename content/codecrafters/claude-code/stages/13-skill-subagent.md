Algumas skills fazem muito trabalho intermediário (ler dezenas de arquivos, rodar
buscas) que só polui o contexto do agente principal. Rode-as em um **subagente**: uma
conversa nova e isolada, da qual só o resultado final volta.

```markdown
---
name: auditar
description: Audita as dependências do projeto
subagent: true
---

Leia package.json e o lockfile e responda só com a lista de riscos.
```

## O que você vai aprender

- isolamento de contexto: o principal vê a conclusão, não o caminho;
- a reaproveitar o loop do agente de forma recursiva.

## O que fazer

Quando a ferramenta `skill` carregar uma skill com `subagent: true` no frontmatter:

1. Comece uma lista de mensagens **nova**: uma mensagem de sistema curta e o corpo da skill
   como mensagem do usuário — sem o histórico do agente principal.
2. Rode o mesmo loop do agente com essas mensagens e as ferramentas `read`, `write` e
   `bash` (sem `skill`, para evitar recursão infinita).
3. Devolva **só a resposta final** do subagente como resultado da ferramenta `skill`.

## Como o tester valida

1. o modelo principal chama `skill` com a skill `subagent: true`;
2. o request seguinte precisa ser do subagente: começa com o corpo da skill e não contém o
   prompt original;
3. o subagente lê um arquivo e responde com um resumo;
4. o request seguinte é do agente principal: o resultado de `skill` precisa ser o resumo,
   e o conteúdo lido pelo subagente **não** pode aparecer no histórico principal.

## Dicas

- Se o loop do stage 4 for uma função `runAgent(messages, tools)`, o subagente é uma chamada
  a mais.

## Critério de conclusão

Skills `subagent: true` rodam isoladas e devolvem só o resultado.
