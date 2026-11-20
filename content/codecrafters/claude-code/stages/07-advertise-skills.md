**Skills** são pacotes de instruções reutilizáveis: um arquivo markdown que ensina o
agente a fazer algo específico (revisar um PR, gerar um changelog...). O primeiro passo é
descobri-las e contar ao modelo que existem.

## O formato

Cada skill é uma pasta em `.agent/skills/` com um `SKILL.md`:

```text
.agent/skills/
  changelog/
    SKILL.md
  revisar/
    SKILL.md
```

```markdown
---
name: changelog
description: Gera o changelog a partir dos commits recentes
---

Leia o git log desde a última tag e escreva um CHANGELOG.md agrupado por tipo.
```

O bloco entre `---` é o *frontmatter* (`chave: valor`); o resto é o **corpo**, com as
instruções.

## O que você vai aprender

- *progressive disclosure*: o modelo vê só nome e descrição, e carrega o corpo quando
  precisa — o contexto fica pequeno mesmo com muitas skills;
- a usar a mensagem de sistema para dar contexto ao modelo.

## O que fazer

1. Ao iniciar, leia todas as pastas de `.agent/skills/` que tenham `SKILL.md`.
2. Faça o parse do frontmatter (`name`, `description`) e guarde o corpo.
3. Envie uma mensagem `role: "system"` (antes da do usuário) listando cada skill em uma
   linha, com nome e descrição:

```text
Available skills:
- changelog: Gera o changelog a partir dos commits recentes
- revisar: Revisa o diff atual procurando bugs
```

## Como o tester valida

- cria 3 skills com nomes e descrições aleatórios;
- confere que a mensagem de sistema tem uma linha com o nome **e** a descrição de cada uma.

## Dicas

- Normalize `\r\n` para `\n` antes de procurar o `---` final do frontmatter.
- Se `name` não estiver no frontmatter, use o nome da pasta.

## Critério de conclusão

O modelo recebe a lista de skills disponíveis.
