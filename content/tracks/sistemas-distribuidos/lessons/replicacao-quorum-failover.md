> **Em uma frase:** réplica sem quórum é cópia; quórum sem failover testado é esperança.

Replicação parece simples: copie os dados para outro nó. Em produção, surgem perguntas: quantas réplicas precisam confirmar uma escrita? Posso ler de uma réplica atrasada? Quem assume quando o primário cai? Quórum é a matemática que evita duas verdades.

## O problema

Um banco com primário e duas réplicas assíncronas perde a última transação no failover. Um sistema com leitura de secundário mostra dado que o usuário acabou de gravar. Um cluster com dois lados acreditando ser primário aceita escritas conflitantes. Sem regras explícitas, a disponibilidade vira inconsistência.

## Como funciona

Com N réplicas, write quorum W e read quorum R, a consistência forte exige **R + W > N**. Exemplo: N=3, W=2, R=2. Toda leitura cruza pelo menos uma réplica que viu a última escrita.

| Configuração | Garantia | Custo |
|---|---|---|
| W=N, R=1 | Escrita durável, leitura rápida | Indisponível se um nó cair |
| W=1, R=1 | Baixa latência | Pode ler dado antigo |
| W=2, R=2 (N=3) | Consistência de quórum | Tolera uma falha |

Líder e seguidores: o líder aceita escritas, propaga e confirma conforme W. Em Raft, a eleição exige maioria; um líder isolado não consegue commit.

```java
boolean commitOk(List<Replica> replicas, Write w, int quorum) {
    int acks = 0;
    for (var r : replicas) {
        try {
            if (r.append(w, Duration.ofMillis(200))) acks++;
        } catch (Exception e) {
            log.warn("réplica {} falhou", r.id(), e);
        }
    }
    return acks >= quorum;
}
```

## Na prática

Defina o requisito: RPO (quanto dado pode perder) e RTO (quanto tempo pode ficar fora). Assíncrono dá menor latência e maior RPO. Síncrono com quórum reduz RPO e aumenta latência.

Failover precisa ser ensaiado: derrube o primário, meça o tempo de eleição e verifique se a aplicação reconecta. No PostgreSQL, use `synchronous_standby_names`; no Kafka, `acks=all` + `min.insync.replicas=2`.

Leituras de secundário exigem tolerância a lag. Para "leia sua escrita", roteie para o líder ou use um token de consistência.

## Armadilhas comuns

- Achar que replicação assíncrona garante zero perda.
- Quórum sem fencing: dois líderes aceitando escrita.
- Failover não testado e DNS com TTL alto.
- Ler de réplica para dado recém-escrito.
- Confundir consenso com replicação simples.

## Checklist de domínio

- [ ] Calculo R+W>N e explico o efeito.
- [ ] Sei o RPO/RTO de cada configuração.
- [ ] Testei failover e reconexão.
- [ ] Trato leitura stale.
- [ ] Conheço o papel do líder no Raft.

## Para ir além

Leia o capítulo de replication do System Design Primer e o artigo de Raft. Depois simule a queda do primário e meça o RTO do seu cluster.
