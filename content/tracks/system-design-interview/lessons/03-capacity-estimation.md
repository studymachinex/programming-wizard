> **Em uma frase:** capacity estimation é a arte de trocar precisão por ordem de grandeza e usar essa ordem para decidir o que construir.

## O problema

Em uma entrevista, você diz "vou usar sharding". O entrevistador pergunta: quantos shards? Você responde "depende". Ele insiste: quantos dados, quantas escritas por shard, qual o custo? O silêncio revela que a decisão não foi calculada, foi copiada. O mesmo acontece com cache, filas e réplicas: sem números, você não sabe se a solução resolve o gargalo ou apenas adiciona complexidade.

A boa notícia é que ninguém espera precisão de planilha. Espera-se que você saiba estimar em potências de dez, declarar suposições e perceber quando um número muda a arquitetura. Um erro de 2x raramente importa; um erro de 1.000x destrói o desenho. O objetivo é acertar a ordem de grandeza e mostrar o raciocínio.

Capacity estimation também protege você de over-engineering. Se o sistema tem 5.000 QPS e 2 TB, um Postgres com réplica resolve; sharding seria custo operacional sem retorno. Se tem 500.000 QPS e 5 PB, um único banco é fantasia. O número é o juiz.

## Como funciona

Comece pelas unidades e pelos números que você já deveria saber de cor.

| Grandeza | Valor aproximado | Como usar |
|---|---|---|
| Segundos por dia | 86.400 (arredonde 100.000) | QPS médio = eventos/dia ÷ 100.000 |
| Segundos por ano | 31,5 milhões | Storage anual |
| 1 milhão de segundos | 11,6 dias | Retenção e timeouts |
| 1 Gbps | 125 MB/s | Banda de rede |
| 1 TB | 10¹² bytes | Storage bruto |

Latências típicas para raciocinar sobre orçamento:

- Acesso à memória: ~100 ns.
- Leitura de SSD: ~100 µs.
- Seek em disco magnético: ~10 ms.
- Round trip dentro do mesmo data center: ~0,5 ms.
- Round trip entre Brasil e Virginia: ~120–150 ms.
- Consulta a banco com índice: ~1–10 ms; sem índice, pode ir a segundos.

O método tem cinco passos:

1. **DAU e ações por usuário.** 100 milhões de DAU, 20 leituras e 2 escritas por dia. Multiplique para eventos/dia.
2. **QPS médio e de pico.** Divida por 86.400 e aplique um fator de pico. Tráfego de consumo costuma ter pico de 2x a 5x a média; eventos ao vivo podem ser 10x.
3. **Storage.** Payload × eventos × retenção. Depois multiplique por 2–3 para réplicas, índices, WAL e overhead. Mídia é uma conta separada.
4. **Banda.** Payload de resposta × QPS × 8 para bits/s. Compare com a capacidade de uma máquina e com o custo de egress.
5. **Recursos.** QPS por nó, conexões, CPU, memória do cache. Use a Lei de Little para concorrência: L = λ × W.

Um exemplo completo. Uma rede social com 100M DAU, 20 leituras e 2 escritas por dia:

- Leituras: 2 bilhões/dia → 23.000 QPS médio; pico de 3x → 70.000 QPS.
- Escritas: 200 milhões/dia → 2.300 QPS médio; pico → 7.000 QPS.
- Cada post tem 1 KB de metadados; 200M/dia → 200 GB/dia → 73 TB/ano. Com replication factor 3 e índice, ~250 TB/ano. Fotos e vídeos ficam em object storage e são outra conta.
- Resposta média do feed: 50 KB. 70.000 QPS × 50 KB = 3,5 GB/s = 28 Gbps no pico. Isso exige CDN; não passa por um data center único.
- Cache: se 20% dos posts concentram 80% dos acessos, o working set é ~15 TB/ano de posts quentes; um cluster Redis de 20 TB é caro, então talvez você cache IDs e hidrate em lote.
- Servidores: a 2.000 QPS por pod, 70.000 QPS exigem 35 pods no pico; com 30% de headroom, 46 pods. Se cada pod custa US$ 100/mês, são US$ 4.600/mês só de compute.

Perceba como o número de pods é a parte menos importante. O que muda o desenho é a banda de 28 Gbps e o storage de 250 TB/ano. A conversa fica técnica: CDN, compressão, retenção, tiered storage.

```java
public class CapacityEstimator {

    public record Workload(
        long dau,
        double readsPerUserDay,
        double writesPerUserDay,
        int peakFactor,
        int readPayloadBytes,
        int writePayloadBytes,
        int retentionDays
    ) {}

    public record Estimate(
        double avgReadQps,
        double peakReadQps,
        double avgWriteQps,
        double peakWriteQps,
        double rawStorageTb,
        double peakEgressGbps
    ) {}

    public static Estimate estimate(Workload w) {
        double secondsPerDay = 86_400.0;
        double readsPerDay = w.dau() * w.readsPerUserDay();
        double writesPerDay = w.dau() * w.writesPerUserDay();

        double avgReadQps = readsPerDay / secondsPerDay;
        double avgWriteQps = writesPerDay / secondsPerDay;
        double peakReadQps = avgReadQps * w.peakFactor();
        double peakWriteQps = avgWriteQps * w.peakFactor();

        double rawBytes = writesPerDay * w.writePayloadBytes() * w.retentionDays();
        double rawStorageTb = rawBytes / 1e12;
        double peakEgressGbps = peakReadQps * w.readPayloadBytes() * 8 / 1e9;

        return new Estimate(avgReadQps, peakReadQps, avgWriteQps, peakWriteQps,
            rawStorageTb, peakEgressGbps);
    }

    public static void main(String[] args) {
        var social = new Workload(100_000_000, 20, 2, 3, 50_000, 1_000, 365);
        var e = estimate(social);
        System.out.printf("Leitura: %.0f QPS médio, %.0f no pico%n", e.avgReadQps(), e.peakReadQps());
        System.out.printf("Escrita: %.0f QPS médio, %.0f no pico%n", e.avgWriteQps(), e.peakWriteQps());
        System.out.printf("Storage bruto: %.1f TB/ano%n", e.rawStorageTb());
        System.out.printf("Egress no pico: %.1f Gbps%n", e.peakEgressGbps());
    }
}
```

```java
public class LatencyBudget {

    public record Call(String service, double p99Ms) {}

    public static double total(Call... calls) {
        double sum = 0;
        for (Call call : calls) {
            sum += call.p99Ms();
        }
        return sum;
    }

    public static long concurrency(double qps, double latencyMs) {
        return Math.round(qps * (latencyMs / 1_000.0));
    }

    public static void main(String[] args) {
        double feed = total(
            new Call("gateway", 5),
            new Call("timeline", 40),
            new Call("hydration", 80),
            new Call("ranking", 120)
        );
        System.out.printf("p99 somado: %.0f ms%n", feed);
        System.out.println("Cabe em 300 ms? " + (feed <= 300));
        System.out.println("Concorrência a 5.000 QPS e 200 ms: " + concurrency(5_000, 200));
    }
}
```

## Na prática

Agora aplique a um chat. Suponha 2 bilhões de usuários, 100 bilhões de mensagens/dia, cada mensagem com 200 bytes de payload e 300 bytes de metadados, retenção de um ano.

- Mensagens/s: 100B ÷ 86.400 ≈ 1,16 milhão/s na média; pico de 2,5x ≈ 2,9 milhões/s.
- Storage bruto: 100B × 500 B = 50 TB/dia → 18 PB/ano. Com replicação 3x, 54 PB. Isso exclui mídia, que vai para object storage e é ainda maior.
- Conexões persistentes: se 20% dos usuários estão online no pico, são 400 milhões de WebSockets. A 100 mil conexões por nó, você precisa de 4.000 nós só de gateway. Esse número, e não o QPS, define a arquitetura.
- Banda de entrega: 2,9M msg/s × 500 B × 8 ≈ 11,6 Gbps só de mensagens; com fanout para grupos, multiplique pelo tamanho médio do grupo.

Aqui, a decisão de sharding por `conversation_id` vem do volume e do requisito de ordering. A decisão de usar WebSocket vem do número de conexões, não de uma preferência por "tempo real". A retenção de um ano define se você usa um banco wide-column ou object storage com índice separado.

Sempre que um número não mudar nenhuma decisão, você pode parar de refiná-lo. Se 1 TB ou 2 TB levam à mesma escolha, não gaste cinco minutos discutindo o segundo dígito. A entrevista é sobre decisão, não sobre contabilidade.

## Armadilhas comuns

- **Usar média quando o pico decide.** Provisionar para a média derruba o sistema no horário de maior tráfego. Declare o fator de pico e por que ele é 2x, 3x ou 10x.
- **Esquecer replicação, índices e WAL.** O payload cru pode ser um terço do custo real de storage. Diga o multiplicador.
- **Confundir bytes com bits.** 1 Gbps não é 1 GB/s; é 125 MB/s. Um erro de 8x muda a conta de servidores.
- **Calcular tudo e não decidir nada.** Capacity estimation é meio, não fim. Termine cada conta com "portanto, X".
- **Precisão falsa.** "Precisamos de 37.482 QPS" soa pior que "cerca de 37 mil QPS". Arredonde e siga.
- **Ignorar o custo de egress.** Em cloud, saída de dados pode custar mais que compute. Em sistemas de vídeo, é a conta principal.
- **Esquecer o working set do cache.** Cache não é o banco inteiro; dimensione pelo que é acessado com frequência, com folga para sazonalidade.

## Checklist de domínio

- [ ] Você converte DAU em QPS médio e de pico em menos de um minuto
- [ ] Você estima storage com replicação e índice, e separa mídia de metadados
- [ ] Você calcula banda de saída e identifica quando CDN é obrigatório
- [ ] Você usa a Lei de Little para dimensionar concorrência e filas
- [ ] Você termina toda estimativa com uma decisão de arquitetura

## Para ir além

- [System Design Primer — Back-of-the-envelope calculations](https://github.com/donnemartin/system-design-primer#back-of-the-envelope-calculations) — tabela de referência e exemplos.
- [Latency Numbers Every Programmer Should Know](https://gist.github.com/jboner/2841832) — o clássico que ancora sua intuição de latência.
- [AWS Builders' Library](https://aws.amazon.com/builders-library/) — artigos sobre retries, timeouts e capacidade em sistemas reais.
- [Designing Data-Intensive Applications](https://dataintensive.net/) — base para entender o que os números fazem com o desenho.
