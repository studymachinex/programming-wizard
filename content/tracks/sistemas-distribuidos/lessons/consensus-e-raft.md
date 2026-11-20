> **Em uma frase:** consenso é como um cluster pequeno concorda sobre uma sequência de decisões mesmo com falhas e partições — e você deve usá-lo para metadados, não para cada clique do usuário.

## O problema

Três réplicas de um serviço de configuração precisam concordar sobre qual nó é o líder. Sem coordenação, cada uma pode se declarar líder durante uma partição. Dois líderes aceitam configurações diferentes; quando a rede volta, metade dos servidores usa um valor e metade usa outro. O sistema não perdeu pacotes: perdeu a noção de verdade única.

Você pode tentar resolver com "o nó de menor IP vence". Funciona até o IP mudar, até a rede dividir, ou até o nó mais antigo ficar lento. Consenso existe porque eleições informais não sobrevivem a falhas reais.

Raft é o algoritmo de consenso mais legível da geração atual. Entender o que ele promete — e o que ele cobra — evita usar etcd como banco de dados e evita chamar qualquer fila de "consistente".

## Como funciona

### O modelo

Um cluster Raft tem N nós e um líder eleito. O líder recebe comandos do cliente, acrescenta ao seu log e replica para os seguidores. Uma entrada é **commitada** quando está na maioria dos nós. O líder então aplica a entrada à máquina de estados e responde ao cliente.

Cada nó mantém:

- `currentTerm`: era lógica, monotônica.
- `votedFor`: candidato que recebeu o voto nesta era.
- `log[]`: entradas com termo e índice.
- `commitIndex` e `lastApplied`.

O termo é o relógio lógico da eleição. Um nó que vê um termo maior atualiza o seu e volta a ser seguidor. Um líder antigo não consegue convencer ninguém de que ainda manda.

### Eleição

Seguidores esperam um heartbeat do líder. Se o timeout expira — tipicamente 150–300 ms randomizados —, um seguidor vira candidato, incrementa o termo, vota em si e pede votos.

O eleitor só vota se o candidato tem log pelo menos tão atualizado quanto o seu: último termo maior, ou mesmo termo com índice maior. Essa regra garante que um líder eleito tenha todas as entradas commitadas. A maioria exigida impede dois líderes no mesmo termo.

```java
enum Role { FOLLOWER, CANDIDATE, LEADER }

final class RaftNode {
    private Role role = Role.FOLLOWER;
    private long currentTerm;
    private String votedFor;
    private long lastLogTerm;
    private long lastLogIndex;

    synchronized boolean requestVote(long term, String candidateId,
                                     long candidateLastTerm, long candidateLastIndex) {
        if (term < currentTerm) {
            return false;
        }
        if (term > currentTerm) {
            currentTerm = term;
            role = Role.FOLLOWER;
            votedFor = null;
        }

        boolean candidateIsUpToDate = candidateLastTerm > lastLogTerm
                || (candidateLastTerm == lastLogTerm && candidateLastIndex >= lastLogIndex);

        if (candidateIsUpToDate && (votedFor == null || votedFor.equals(candidateId))) {
            votedFor = candidateId;
            return true;
        }
        return false;
    }

    synchronized void appendEntries(long term) {
        if (term < currentTerm) {
            throw new IllegalStateException("líder obsoleto");
        }
        if (term > currentTerm) {
            currentTerm = term;
            votedFor = null;
        }
        role = Role.FOLLOWER;
    }
}
```

Falta a verificação de `prevLogIndex/prevLogTerm` e a truncagem de log conflitante; o esqueleto acima mostra só a parte de termo e voto. Um nó não vota duas vezes na mesma era, e um candidato desatualizado é rejeitado.

### Commit e quórum

O líder avança `commitIndex` quando uma entrada da **era atual** está replicada na maioria. Entradas de eras antigas não podem ser commitadas apenas por contagem; elas são commitadas indiretamente quando uma entrada da era atual é commitada.

```java
import java.util.Comparator;
import java.util.List;

record Ack(String node, long matchIndex, long term) {
}

final class RaftCommit {
    static int majority(int clusterSize) {
        return clusterSize / 2 + 1;
    }

    static int toleratedFailures(int clusterSize) {
        return (clusterSize - 1) / 2;
    }

    static long advance(long currentCommit, long currentTerm,
                        List<Ack> acks, int clusterSize) {
        int needed = majority(clusterSize);
        if (acks.size() < needed) {
            return currentCommit;
        }

        List<Ack> sorted = acks.stream()
                .sorted(Comparator.comparingLong(Ack::matchIndex).reversed())
                .toList();
        long candidate = sorted.get(needed - 1).matchIndex();

        boolean currentTermAck = sorted.stream()
                .anyMatch(a -> a.term() == currentTerm && a.matchIndex() >= candidate);

        return currentTermAck ? Math.max(currentCommit, candidate) : currentCommit;
    }
}
```

A tabela abaixo mostra por que adicionar nós sem critério não ajuda:

| Nós | Quórum | Tolera falhas | Custo relativo |
|---|---|---|---|
| 3 | 2 | 1 | 1× |
| 4 | 3 | 1 | 1,33× |
| 5 | 3 | 2 | 1,66× |
| 6 | 4 | 2 | 2× |

Um cluster de 4 tem a mesma tolerância do de 3, mas exige mais uma réplica para cada escrita. Em geral, use 3 para uma região e 5 para sobreviver à perda de uma de três regiões.

## Na prática

O custo dominante é o round-trip até o quórum. Em uma região, com RTT de 0,5 ms e fsync de 2 ms, uma escrita no etcd pode fechar em 5–15 ms. Com três regiões (30–70 ms de RTT), a mesma escrita passa de 40 ms, porque o líder precisa ouvir a maioria — normalmente o segundo data center mais rápido.

Use consenso para:

- eleição de líder e metadados de cluster;
- configuração, feature flags críticas e descoberta de serviço;
- locks com fencing e leases curtos;
- coordenação de partições, não para armazenar o catálogo inteiro.

Não use para cada escrita de pedido. O throughput é limitado por fsync e round-trip; um banco de dados comum com replicação assíncrona serve milhares de vezes mais operações por segundo e aceita um RPO pequeno.

## Armadilhas comuns

- **Cluster de 4 nós.** Você paga mais e não ganha tolerância; prefira 3 ou 5.
- **Adicionar réplicas em outra região para "melhorar a leitura".** Toda escrita fica mais lenta; leituras locais de seguidor podem estar velhas.
- **Ignorar fsync.** Consenso sem durabilidade em disco pode perder uma entrada commitada após queda de energia.
- **Ler do seguidor sem lease.** O seguidor pode estar atrás do commit index; para leitura linearizável, use ReadIndex ou lease do líder.
- **Usar consenso para tudo.** O algoritmo é correto, mas o custo de coordenação domina o produto.

## Checklist de domínio

- [ ] Você explica eleição, termo e a regra de log atualizado
- [ ] Você calcula quórum e tolerância para 3, 5 e 7 nós
- [ ] Você sabe por que uma entrada de termo antigo não é commitada por contagem simples
- [ ] Você escolhe o que guardar no etcd e o que deixar fora
- [ ] Você reconhece o custo de latência de um cluster multi-região

## Para ir além

- [Raft: In Search of an Understandable Consensus Algorithm](https://raft.github.io/raft.pdf) — o paper, com a figura que explica tudo.
- [etcd: Learning](https://etcd.io/docs/v3.5/learning/) — implementação real, eleições e leases.
- [Jepsen: etcd 3.4.3](https://jepsen.io/analyses/etcd-3.4.3) — o que testes de caos encontraram em consenso de verdade.
