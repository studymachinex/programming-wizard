# Cenas interativas: visão geral e plano de execução

Spec aprovada em 27/11/2026. Implementação por fases; cada fase termina com commit + push e relatório.

## O que é

Uma **cena** é uma história de 8 a 12 passos que abre a aula: cada passo tem um tipo (Contexto, Problema,
Solução, Conceito, Trade-off, Resumo), um texto curto, um estado do diagrama e, opcionalmente, métricas,
comando em destaque e terminal simulado. Entre um passo e outro o motor **anima a diferença** (o que tem o
mesmo id se move ou muda de estado, o que é novo entra, o que sumiu sai). O autor escreve só dados.

Inspiração de conceito: o Kubernetes Visual (andrentfs.github.io/kubernetes-visual). **Não copie código,
textos, ícones nem arte desse site** nem de cursos pagos: o motor é nosso, com a identidade visual da
plataforma, e todo o conteúdo é original, em português.

O visualizador de algoritmos (`lib/visualizers`) continua existindo e não muda. As cenas são um segundo
sistema, ao lado dele, para infraestrutura, redes e system design.

## Documentos

| Arquivo | Conteúdo |
|---|---|
| [motor.md](motor.md) | Tipos, renderizadores, player, terminal, registro, checador, integração na página |
| [piloto.md](piloto.md) | As 3 cenas da Fase 0, passo a passo |
| [curriculo.md](curriculo.md) | Trilhas Redes, Docker e Kubernetes (aulas, modos de cena, exercícios) e as cenas de system design da Fase 4 |

## Decisões tomadas

- Três trilhas novas: `redes-backend`, `docker`, `kubernetes`.
- A trilha `cloud-devops` é **enxugada** para CI/CD, Cloud e SRE (slug mantido): os módulos `docker` e
  `kubernetes` saem dela quando as trilhas novas equivalentes estiverem publicadas (fim da Fase 2 e da Fase 3).
  O progresso dessas 8 aulas é perdido; foi aceito.
- Cortes de escopo aceitos: nada de GNS3/Open vSwitch, provisionamento com Proxmox/Terraform/kubespray,
  nem aprofundamento em Docker Content Trust (vira menção dentro da aula de assinatura de imagens).
- Fase 4 aprovada: cenas para as aulas de system design.

## Fases

| Fase | Entrega | Para no fim? |
|---|---|---|
| 0 | Motor completo + poda de aulas órfãs no seed + 3 cenas piloto anexadas a aulas que já existem | **Sim**: o usuário aprova o visual antes de escalar |
| 1 | Trilha Redes para Backend completa (30 aulas, cenas, quizzes, exercícios) | Não |
| 2 | Trilha Docker completa (26 aulas) + remoção do módulo `docker` de `cloud-devops` | Não |
| 3 | Trilha Kubernetes completa (41 aulas) + remoção do módulo `kubernetes` de `cloud-devops` | Não |
| 4 | Cenas nas aulas de system design (lista em curriculo.md) | Fim |

## Fluxo de trabalho (vale para toda fase)

1. Leia `motor.md` inteiro antes de escrever código. Leia 2 aulas existentes antes de escrever conteúdo
   (`content/tracks/machine-coding-lld/lessons/02-kv-store-ttl.md` e
   `content/tracks/cloud-devops/lessons/services-ingress-dns.md`).
2. Commit + push **ao fim de cada módulo** de trilha (Fases 1–3) e ao fim de cada fase. Mensagens no padrão
   do repositório (`feat(cenas): ...`, `feat(conteudo): ...`). Comandos git prefixados com `rtk`.
3. Antes de cada commit, tudo verde:
   - `npm run typecheck`
   - `npm run validate:content` (sem erros; avisos novos só os previstos nesta spec)
   - `npx tsx scripts/check-scenes.ts`
   - `npx tsx scripts/check-visualizers.ts` (não pode quebrar)
   - `npx tsx scripts/check-exercises.ts <prefixo>` para exercícios novos
   - `npm run seed` (upsert; não usar `--reset`)
4. Verificação visual no Chrome em `http://localhost:3000` (o dev server já roda em background; não suba
   outro). Abra pelo menos 3 aulas com cena por módulo, avance todos os passos, teste o terminal, a tela
   cheia e a largura de celular (redimensione a janela para ~390 px).
5. Não crie arquivos fora do que a spec pede. Scripts temporários vão para o scratchpad, não para o repo.

## Regras de conteúdo (Fases 1–4)

- Português do Brasil, conteúdo original. As ementas de referência servem **só** como mapa de tópicos.
- Markdown da aula no formato da casa: `> **Em uma frase:** ...`, `## O problema`, `## Como funciona`,
  `## Na prática`, `## Armadilhas comuns`, `## Checklist de domínio`, `## Para ir além`. Sem H1.
- Mínimo de 550 palavras por aula. Bloco ```java sempre que for natural (servidor TCP/UDP, graceful
  shutdown, health endpoint, cliente HTTP com pool, JVM em container). Em aulas puramente de YAML/CLI o
  aviso "sem bloco Java" é aceito, mas no máximo 40% das aulas de cada trilha podem ficar sem Java.
- Cada aula no `track.json` com 2 a 4 takeaways e 3 a 4 perguntas de quiz com explicação.
- O markdown **aprofunda** a cena; não repita o texto dos passos. A cena é a intuição, o markdown é o detalhe,
  os números, os comandos e as armadilhas.
- Links de "Para ir além": documentação oficial ou RFC. Verifique que respondem (status 200) antes de commitar.
- Exercícios: formato atual (classe pública `Solution`, classes aninhadas estáticas, JUnit 5, relógio
  injetado via `LongSupplier` quando houver tempo, seção `## Restrições` no enunciado). Precisam passar no
  `check-exercises` (solução passa, starter compila e falha).
