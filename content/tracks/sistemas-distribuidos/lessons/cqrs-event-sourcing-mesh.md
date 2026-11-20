> **Em uma frase:** CQRS, event sourcing e service mesh resolvem três problemas diferentes — e a maioria dos times adota os três antes de ter qualquer um deles.

## O problema

O dashboard de pedidos faz sete joins, leva quatro segundos e roda 20 mil vezes por minuto no mesmo banco do checkout. O time propõe "CQRS com event sourcing e Istio" em um único PR. Três decisões, três custos, uma justificativa.

São problemas separados: leitura cara, histórico de mudanças e tráfego entre serviços. Tratá-los juntos é a receita para um sistema que ninguém consegue operar.

## Como funciona

### CQRS

CQRS separa o modelo de escrita do modelo de leitura. O lado de escrita valida invariantes e grava; o lado de leitura é uma projeção otimizada para consulta. Não exige event sourcing: você pode ter uma tabela `order_summary` atualizada por triggers, CDC ou um job.

O custo é a defasagem. Se a projeção leva dois segundos para atualizar, o usuário que acabou de comprar pode não ver o pedido. Você precisa de um SLO de lag e de uma estratégia de rebuild.

### Event sourcing

Event sourcing grava o estado como sequência de eventos. O agregado é reconstruído aplicando os eventos; o banco é um log append-only. Isso dá auditoria completa, consultas temporais e a possibilidade de criar novas projeções a partir do histórico.

O preço: evolução de schema, snapshots, idempotência, tamanho do log e privacidade (apagar um dado exige criptografia por chave ou reescrita). Um event store não é um broker: ele é a fonte de verdade, ordenada por stream.

```java
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

sealed interface OrderEvent permits OrderCreated, ItemAdded, OrderConfirmed {
    String orderId();
}
record OrderCreated(String orderId) implements OrderEvent { }
record ItemAdded(String orderId, String sku, int quantity) implements OrderEvent { }
record OrderConfirmed(String orderId) implements OrderEvent { }

final class EventStore {
    private final Map<String, List<OrderEvent>> streams = new HashMap<>();

    // expectedVersion = -1 para stream novo. A checagem evita lost update.
    synchronized void append(String streamId, long expectedVersion, List<OrderEvent> events) {
        List<OrderEvent> stream = streams.computeIfAbsent(streamId, k -> new ArrayList<>());
        long current = stream.size() - 1L;
        if (current != expectedVersion) {
            throw new IllegalStateException("versão esperada " + expectedVersion + ", atual " + current);
        }
        stream.addAll(events);
    }

    synchronized List<OrderEvent> load(String streamId) {
        return List.copyOf(streams.getOrDefault(streamId, List.of()));
    }
}
```

Com 50 mil eventos por agregado, reconstruir a cada leitura é inviável. Snapshots a cada 500 eventos reduzem a leitura a 500 aplicações no pior caso.

```java
import java.util.HashMap;
import java.util.Map;

record OrderSummary(String orderId, int items, boolean confirmed) { }

final class OrderSummaryProjection {
    private final Map<String, Long> lastVersion = new HashMap<>();
    private final Map<String, OrderSummary> view = new HashMap<>();

    // Idempotente: reaplicar o mesmo evento não altera o resultado.
    synchronized void apply(String streamId, long version, OrderEvent event) {
        if (version <= lastVersion.getOrDefault(streamId, -1L)) return;
        OrderSummary current = view.getOrDefault(streamId, new OrderSummary(streamId, 0, false));
        OrderSummary next = switch (event) {
            case OrderCreated e -> current;
            case ItemAdded e -> new OrderSummary(streamId, current.items() + e.quantity(), current.confirmed());
            case OrderConfirmed e -> new OrderSummary(streamId, current.items(), true);
        };
        view.put(streamId, next);
        lastVersion.put(streamId, version);
    }

    synchronized OrderSummary get(String streamId) {
        return view.get(streamId);
    }
}
```

### Service mesh

O mesh move mTLS, retries, telemetria e traffic splitting para um proxy ao lado de cada pod. O custo é real: dois sidecars por pod, 1–3 ms por salto, 10–15% de CPU adicional e uma camada nova para depurar. Com 20 serviços e um time, o mesh é operação sem retorno. Com 200 serviços, múltiplos runtimes e exigência de mTLS, ele passa a pagar.

## Na prática

| Ferramenta | Resolve | Custo principal | Quando dizer sim |
|---|---|---|---|
| CQRS | leitura cara ou modelada diferente | lag e rebuild | razão leitura/escrita alta |
| Event sourcing | auditoria e histórico | schema e snapshots | o histórico é o produto |
| Service mesh | mTLS e tráfego entre serviços | latência e operação | muitos serviços e times |

Números para decidir: se o dashboard é 20 mil RPM e o checkout é 2 mil RPM, separar a leitura tira 90% da carga do banco de escrita. Se o histórico é auditado por compliance e você já guarda tudo em log imutável, event sourcing pode substituir dois sistemas. Se o mesh adiciona 2 ms a um orçamento de 200 ms, é 1%; se adiciona 2 ms a um orçamento de 20 ms, é 10%.

## Armadilhas comuns

- **CQRS sem rebuild.** Um bug na projeção exige reconstruir do zero; se não há caminho, você perdeu a fonte.
- **Event sourcing como CRUD.** Gravar `EntityUpdated` com o estado inteiro é um banco de dados com passos extras.
- **Evento como contrato sem versão.** Consumidores antigos quebram quando um campo muda de tipo.
- **Retry no mesh e no código.** Multiplicação de tentativas: 3 × 3 = 9 chamadas por requisição.
- **Mesh para resolver código ruim.** O proxy não conserta timeout ausente nem chamada não idempotente.

## Checklist de domínio

- [ ] Você separa CQRS de event sourcing com um exemplo de cada
- [ ] Você implementa um append com versão esperada
- [ ] Você explica quando um snapshot é necessário
- [ ] Você calcula o custo de um sidecar no orçamento de latência
- [ ] Você sabe dizer não às três ferramentas no mesmo trimestre

## Para ir além

- [CQRS](https://martinfowler.com/bliki/CQRS.html) — a definição e os mal-entendidos.
- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) — padrão, variantes e custos.
- [Event Sourcing pattern](https://microservices.io/patterns/data/event-sourcing.html) — implementação e trade-offs.
