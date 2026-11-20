> **Em uma frase:** SLO é uma promessa mensurável; on-call é quem paga a promessa às 3h — runbook é o que impede que a pessoa improvise sob pressão.

Sem SLO, todo alerta é urgente e nenhum é confiável. Sem runbook, cada incidente é uma investigação do zero. Sem postmortem, o mesmo erro volta. Operação madura é um ciclo: medir, alertar, responder, aprender.

## O problema

O time recebe 200 alertas por semana; 180 são ruído. O engenheiro de plantão ignora o canal. Quando um incidente real acontece, ninguém sabe qual dashboard abrir, quem acionar ou como reverter o deploy. O MTTR cresce, a confiança cai.

## Como funciona

**SLI:** proporção de eventos bons. Ex.: requisições < 300 ms / total. **SLO:** meta, ex.: 99,9% em 28 dias. **Error budget:** 0,1% = ~40 minutos de indisponibilidade em 28 dias.

```text
SLO 99,9% em 28 dias
orçamento = 0,001 × 28 × 24 × 60 = 40,3 min
queima rápida: 14,4x em 1h -> alerta crítico
queima lenta: 1x em 6h -> ticket
```

Alertas multi-janela reduzem ruído: dispare quando a queima rápida e a lenta concordam. Alerte em sintoma (latência/erro), não em causa (CPU).

**Runbook:** passos concretos, comandos copiáveis, critérios de escalonamento e rollback. Exemplo:

```markdown
## Latência p99 > 1,5s
1. Verifique dashboard `Pedidos / Latência`.
2. Compare com deploy recente: `kubectl rollout history deploy/pedidos`.
3. Se começou após deploy, `kubectl rollout undo deploy/pedidos`.
4. Verifique saturação do banco: conexões ativas e slow queries.
5. Escale se CPU > 80% por 10 min: `kubectl scale --replicas=+2`.
6. Acione DBA se lag de réplica > 30s.
```

## Na prática

Classifique severidade: SEV1 (usuário sem serviço), SEV2 (degradação relevante), SEV3 (interno). Defina quem acorda para cada uma. Faça game day: simule falha de dependência e cronometre a resposta.

Postmortem sem culpa: timeline, impacto, causa raiz, fatores contribuintes, ações com dono e prazo. Não aceite "erro humano" como causa raiz; pergunte qual salvaguarda faltou.

## Armadilhas comuns

- SLO de 100%: impossível e incentiva esconder falhas.
- Alertar em cada métrica de infraestrutura.
- Runbook desatualizado que manda abrir um dashboard que não existe.
- Postmortem sem ação ou com ação sem dono.
- Error budget que ninguém usa para decidir prioridade.

## Checklist de domínio

- [ ] Defino SLI, SLO e error budget com números.
- [ ] Configuro alertas de queima multi-janela.
- [ ] Tenho runbooks testados.
- [ ] Sei classificar severidade e escalar.
- [ ] Conduzo postmortem sem culpa com ações rastreadas.

## Para ir além

Leia o Google SRE Workbook sobre SLOs e postmortems. Depois escreva o runbook de um serviço seu e teste com alguém que não o conhece.
