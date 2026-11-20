> **Em uma frase:** microservices compram autonomia de times com complexidade distribuída; se você não precisa da autonomia, está pagando a conta sem levar o produto.

## O problema

A empresa tem 40 pessoas de engenharia, um monólito Java de 380 mil linhas e um deploy semanal que exige uma janela de seis horas. Um consultor apresenta um diagrama com 28 serviços. O CTO aprova. Um ano depois, existem 31 serviços, nove pipelines, um banco compartilhado e um checkout que faz 14 chamadas síncronas para confirmar um pedido. O tempo de deploy caiu; o tempo de diagnóstico triplicou.

O problema não é o monólito nem o microservice: é escolher o estilo por moda em vez do gargalo real. Os dois têm preço, e o preço aparece em lugares diferentes.

## Como funciona

Monólito é uma unidade de deploy. Chamadas entre módulos são chamadas de método: dezenas de nanossegundos, transação ACID única, um conjunto de logs. O limite é organizacional: 40 pessoas commitando no mesmo artefato, filas de merge, um deploy que precisa de consenso.

Microservices distribuem deploy e banco. A chamada vira RPC: 1–3 ms na mesma zona, com p99 de 10–50 ms sob carga. Cada serviço tem seu banco, seu SLO e seu modo de falha. Duas propriedades mudam a conta:

**Disponibilidade em série.** Serviços que se chamam em cadeia multiplicam indisponibilidades. Oito serviços a 99,99% cada dão 0,9999^8 ≈ 99,92% — cerca de sete horas por ano em vez de 52 minutos.

**Falha parcial.** Um serviço lento não retorna erro; retorna depois de 30 segundos, segurando threads e conexões. Sem timeout, bulkhead e breaker, a falha viaja.

```java
import java.util.List;

record Hop(String name, double availability, int p99Millis) { }

final class JourneyBudget {
    // Em série, as disponibilidades se multiplicam.
    static double availability(List<Hop> hops) {
        return hops.stream().mapToDouble(Hop::availability).reduce(1.0, (a, b) -> a * b);
    }

    // No pior caso, os p99 também se somam.
    static int serialP99(List<Hop> hops) {
        return hops.stream().mapToInt(Hop::p99Millis).sum();
    }

    static double downtimeHoursPerYear(List<Hop> hops) {
        return (1.0 - availability(hops)) * 365 * 24;
    }
}
```

Com oito hops de 99,99% e 40 ms de p99, `downtimeHoursPerYear` retorna ~7,0 e `serialP99` retorna 320 ms. O usuário não vê a média de 40 ms; vê o encadeamento.

### O que realmente justifica extrair

Extraia quando o custo de coordenar for maior que o custo de distribuir:

- Um módulo é alterado por dois ou mais times e cada release exige sincronização de calendário.
- O módulo precisa escalar em ordem de grandeza diferente (vídeo versus CRUD).
- Requisitos de compliance, disponibilidade ou latência diferentes.
- O domínio tem fronteira clara: o vocabulário muda ao atravessá-la.

Não extraia com menos de ~20 engenheiros, sem fronteira de domínio ou porque "o diagrama fica bonito". Um monólito modular com fronteiras explícitas é mais barato e mais fácil de operar.

```java
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

// O contrato do módulo é a costura: sobrevive à extração sem mudar o chamador.
interface Billing {
    CompletableFuture<String> charge(String orderId, long amountCents);
}

final class InProcessBilling implements Billing {
    private final Ledger ledger;
    InProcessBilling(Ledger ledger) { this.ledger = ledger; }

    @Override
    public CompletableFuture<String> charge(String orderId, long amountCents) {
        return CompletableFuture.completedFuture(ledger.append(orderId, amountCents));
    }
}

final class RemoteBilling implements Billing {
    private final BillingClient client;
    private final Duration timeout;
    RemoteBilling(BillingClient client, Duration timeout) {
        this.client = client;
        this.timeout = timeout;
    }

    @Override
    public CompletableFuture<String> charge(String orderId, long amountCents) {
        return client.charge(orderId, amountCents)
                .orTimeout(timeout.toMillis(), TimeUnit.MILLISECONDS);
    }
}

interface Ledger { String append(String orderId, long amountCents); }
interface BillingClient { CompletableFuture<String> charge(String orderId, long amountCents); }
```

`InProcessBilling` e `RemoteBilling` implementam o mesmo contrato. O chamador já lida com `CompletableFuture`, timeout e falha. Na extração, você troca a implementação; não reescreve o domínio.

### Distributed monolith

O pior dos dois mundos tem sintomas reconhecíveis: banco compartilhado como fonte de verdade, deploys em lockstep, serviços que só funcionam juntos, entidades copiadas em cinco repositórios e chamadas síncronas em cascata para montar uma tela.

## Na prática

O roteiro de extração que não vira distributed monolith é o strangler fig:

1. Coloque uma fachada ou proxy na frente do módulo antigo e meça o tráfego real.
2. Construa o novo serviço com banco próprio e consuma o antigo por uma camada de tradução.
3. Espelhe leituras e compare resultados antes de cortar.
4. Migre escritas com outbox e idempotência; mantenha os dois caminhos por um período.
5. Desligue o caminho antigo só quando o tráfego residual for zero.

Números para o design doc: "o checkout faz hoje três chamadas em processo; depois da extração, duas RPCs com p99 de 30 ms cada e disponibilidade combinada de 99,95%; aceitamos quatro horas/ano de indisponibilidade adicional em troca de 12 deploys/dia do time de pricing". Isso é uma decisão. O resto é discurso.

## Armadilhas comuns

- **"Microservices escalam melhor."** Escalam a organização; o banco continua sendo o gargalo. Sharding e cache resolvem mais.
- **Serviço por entidade.** Um `CustomerService` que só faz CRUD não tem fronteira de domínio; é um banco com latência de rede.
- **Banco compartilhado.** Dois serviços no mesmo schema são um monólito com dois deploys e nenhuma transação.
- **Cadeia síncrona profunda.** Cada salto adiciona p99 e um modo de falha. Prefira fan-out paralelo com deadline ou eventos.
- **Extração sem observabilidade.** Sem tracing distribuído, você troca stack trace por correlação de IDs incompleta.

## Checklist de domínio

- [ ] Você calcula a disponibilidade e o p99 de uma cadeia de serviços
- [ ] Você lista três gatilhos concretos para extrair um serviço
- [ ] Você reconhece um distributed monolith em cinco minutos de entrevista
- [ ] Você desenha a costura (contrato) antes de extrair, incluindo timeout e falha
- [ ] Você sabe explicar quando um monólito modular é a resposta certa

## Para ir além

- [Microservices](https://martinfowler.com/articles/microservices.html) — o artigo original de Fowler e Lewis, com os trade-offs.
- [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) — por que quase todo sistema bem-sucedido começou monolítico.
- [Strangler Application](https://microservices.io/patterns/refactoring/strangler-application.html) — o padrão de migração incremental.
