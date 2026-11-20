> **Em uma frase:** CAP não é uma escolha entre três letras; é o comportamento obrigatório de uma operação quando a rede se parte, e PACELC mostra que o mesmo pedágio aparece mesmo quando tudo está no ar.

## O problema

Sua empresa tem um checkout que lê estoque, um catálogo que mostra produtos e um carrinho que precisa sobreviver ao usuário trocar de celular. Um arquiteto propõe "usar um banco CA" para o checkout e "um banco AP" para o catálogo. A frase soa técnica, mas todo sistema distribuído é particionável — e a partição não pergunta o que está no diagrama.

O problema real aparece em uma terça-feira: a rede entre `us-east-1` e `us-west-2` cai por seis minutos. O banco tem réplicas nos dois lados. O checkout continua aceitando pedidos? O catálogo continua servindo páginas? O carrinho mostra o mesmo conteúdo nas duas costas? Cada resposta tem um custo diferente, e você precisa escolhê-lo antes do incidente — não durante.

CAP é útil porque força essa escolha. Ele é inútil quando vira slogan.

## Como funciona

A formulação original de Eric Brewer, provada por Gilbert e Lynch, fala de três propriedades em um sistema com dados replicados:

- **C (consistency)**: linearizability. Toda operação parece acontecer instantaneamente entre seu início e fim, e uma leitura posterior a uma escrita concluída enxerga essa escrita.
- **A (availability)**: toda requisição recebida por um nó **não falho** termina com resposta, sem erro e sem timeout indefinido. Não é "99,99% no SLO"; é uma garantia de resposta por requisição.
- **P (partition tolerance)**: a rede pode perder mensagens entre nós. Em qualquer sistema que atravessa uma rede, isso não é opcional.

Quando há partição, um lado não consegue falar com o outro. Para manter C, o lado minoritário precisa recusar leituras ou escritas — perde A. Para manter A, ele responde com o que tem — perde C. Não existe almoço. O "CA" só descreve um sistema que não aceita partições, o que na prática significa um banco em uma única máquina.

### O que cada sistema escolhe

| Sistema | Partição | Sem partição | Observação |
|---|---|---|---|
| Dynamo / Cassandra (padrão) | PA | EL | Escritas locais, leituras podem vir velhas |
| Bigtable / HBase | PC | EC | Consenso no caminho de escrita |
| Spanner | PC | EC | TrueTime e commit-wait |
| PostgreSQL com síncrono | PC | EC | Falha se não houver quórum |

"PC/EC" não é elogio: Spanner paga latência de commit em toda escrita, mesmo sem partição — o E de PACELC. Cassandra com `LOCAL_QUORUM` escolhe latência regional e aceita que uma leitura em outra região não veja a última escrita.

### Quorum é onde a teoria vira conta

Com N réplicas, write quorum W e read quorum R, a condição `R + W > N` garante que os conjuntos se sobrepõem. Com N=3, W=2 e R=2, uma escrita precisa de duas confirmações e uma leitura consulta duas réplicas; pelo menos uma delas viu a escrita. Isso não entrega linearizability de graça: sem escrita atômica, read repair e tratamento de conflito, você tem apenas sobreposição.

```java
record ReplicaSet(int n, int readQuorum, int writeQuorum) {
    ReplicaSet {
        if (n < 3 || n % 2 == 0) {
            throw new IllegalArgumentException("use N ímpar e >= 3 para maioria clara");
        }
        if (readQuorum < 1 || writeQuorum < 1) {
            throw new IllegalArgumentException("quóruns precisam ser positivos");
        }
        if (readQuorum + writeQuorum <= n) {
            throw new IllegalArgumentException("R + W <= N: leitura pode não ver a escrita");
        }
    }

    int toleratedFailures() {
        return n - Math.max(readQuorum, writeQuorum);
    }

    boolean canRead(int acks) {
        return acks >= readQuorum;
    }

    boolean canWrite(int acks) {
        return acks >= writeQuorum;
    }
}
```

Com N=3, R=2, W=2, `toleratedFailures()` retorna 1. Perdeu duas réplicas, o sistema para de aceitar operações que exigem maioria — o comportamento CP que o checkout pode querer.

O carrinho pode escolher outro caminho: aceitar a escrita local e resolver o conflito depois. O código abaixo deixa explícita a decisão de fail-open:

```java
import java.util.HashSet;
import java.util.Set;

final class CartReplica {
    private final String replicaId;
    private final Set<String> items = new HashSet<>();
    private long localVersion = 0;

    CartReplica(String replicaId) {
        this.replicaId = replicaId;
    }

    // Aceita a operação mesmo sem quórum. O conflito é resolvido depois.
    void addItem(String sku) {
        items.add(sku);
        localVersion++;
    }

    CartSnapshot snapshot() {
        return new CartSnapshot(replicaId, localVersion, Set.copyOf(items));
    }

    // Merge ingênuo: soma itens. Funciona para carrinho, não para saldo.
    void merge(CartSnapshot other) {
        items.addAll(other.items());
        localVersion = Math.max(localVersion, other.version()) + 1;
    }
}

record CartSnapshot(String replicaId, long version, Set<String> items) {
}
```

Esse merge é um add-wins grosseiro: se um lado removeu um item e o outro adicionou, o item reaparece. Para carrinho, "reaparecer" costuma ser aceitável; para saldo ou estoque, seria um desastre. A escolha do modelo de dados acompanha a escolha de CAP.

### O custo escondido

Em uma partição de seis minutos, um sistema AP com 50 mil requisições por segundo aceita cerca de 18 milhões de operações. Se 0,2% delas conflitam, são 36 mil registros para reconciliar. Um sistema CP recusa essas mesmas 18 milhões, mas não tem reconciliação. Nenhum dos dois é grátis: um paga em complexidade de merge e suporte; o outro, em indisponibilidade visível.

## Na prática

Modele a decisão **por operação**, não por empresa:

- **Estoque no checkout**: CP. Uma unidade vendida duas vezes custa dinheiro real e suporte. Prefira recusar a venda a vender o que não existe.
- **Contador de visualizações**: AP. Perder ou atrasar alguns números não muda a decisão do usuário.
- **Catálogo**: AP com staleness limitado. Um preço 30 segundos velho é aceitável; um preço de ontem não é.
- **Carrinho**: AP com merge e versão. O usuário não pode perder o carrinho porque uma região caiu.

Coloque o número no design doc: "durante partição, o checkout falha fechado; a disponibilidade medida cai de 99,95% para 99,7% na janela, e aceitamos esse risco porque o custo de oversell é 40× o de uma venda perdida". Isso é uma decisão de arquitetura. "Escolhemos CAP" não é.

## Armadilhas comuns

- **Dizer que o sistema é CA.** Se cruza rede, P não é opção: existe comportamento CP ou AP durante a partição.
- **Confundir consistência com durabilidade.** Um sistema pode ser linearizável e perder dados se não fizer fsync.
- **Achar que a partição é rara.** Ela é constante: link saturado, GC pausado, pacote descartado, AZ lenta.
- **Ignorar PACELC.** O banco é CP, mas você configurou leitura em follower; em produção, construiu um AP com outro nome.
- **Tratar "AP" como licença para não decidir.** AP exige conflito, versão e reconciliação; sem isso, é perda de dados com diagrama bonito.

## Checklist de domínio

- [ ] Você explica por que "CA" não descreve um sistema que atravessa rede
- [ ] Você calcula N, R e W para um requisito de latência e falha
- [ ] Você classifica uma operação real em CP ou AP e justifica com custo de negócio
- [ ] Você reconhece o E de PACELC em uma decisão de leitura regional
- [ ] Você sabe qual merge usaria para carrinho, saldo e contador

## Para ir além

- [CAP Twelve Years Later](https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/) — Brewer revisando o próprio teorema.
- [Jepsen: modelos de consistência](https://jepsen.io/consistency) — o mapa mais preciso das garantias, com diagramas de inclusão.
- [Replicated Data Consistency Explained Through Baseball](https://www.microsoft.com/en-us/research/publication/replicated-data-consistency-explained-through-baseball/) — leitura acessível sobre o que cada modelo promete.
