> **Em uma frase:** DDD não é um conjunto de anotações; é a disciplina de decidir onde uma palavra significa uma coisa só e proteger essa fronteira com código e contrato.

## O problema

A tabela `customers` tem 87 colunas. Faturamento usa `payment_terms` e `tax_id`; suporte usa `plan` e `entitlements`; logística usa `address` e `delivery_window`; marketing usa `consent` e `segment`. Cada time pede uma coluna nova, ninguém sabe quais estão mortas, e uma mudança em `status` quebra três relatórios e um job noturno.

O problema não é SQL. É que "cliente" significa quatro coisas diferentes e o modelo único tenta ser as quatro ao mesmo tempo. DDD chama isso de falta de fronteira.

## Como funciona

**Subdomínio** é o problema: faturamento, suporte, logística, marketing. **Bounded context** é a solução: onde um modelo e uma linguagem têm significado preciso. O mesmo termo pode ter definições diferentes em contextos diferentes — e isso é saudável, desde que a tradução seja explícita.

Um contexto pode ser um módulo no monólito, um serviço ou um processo. A fronteira é linguística e de modelo, não de deploy.

### Agregados

Agregado é a unidade de consistência transacional. Ele protege invariantes que precisam valer no commit. `Pedido` com suas linhas é um agregado: o total precisa ser a soma das linhas, e o limite de 50 linhas precisa valer para todas. `Cliente` é outro agregado: o pedido referencia `customerId`, não o objeto `Cliente`.

Regra prática: uma transação altera um agregado. Se você precisa alterar dois atomicamente, provavelmente cortou a fronteira no lugar errado.

```java
import java.util.ArrayList;
import java.util.List;

record OrderId(String value) { }
record Sku(String value) { }
record Money(long cents) {
    Money plus(Money other) { return new Money(cents + other.cents); }
    Money times(int qty) { return new Money(cents * qty); }
}

final class Order {
    private static final int MAX_LINES = 50;
    private final OrderId id;
    private final List<Line> lines = new ArrayList<>();
    private boolean confirmed;

    Order(OrderId id) { this.id = id; }

    void addLine(Sku sku, int quantity, Money unitPrice) {
        if (confirmed) throw new IllegalStateException("pedido confirmado não aceita itens");
        if (quantity <= 0) throw new IllegalArgumentException("quantidade positiva");
        if (lines.size() >= MAX_LINES) throw new IllegalStateException("limite de linhas");
        lines.add(new Line(sku, quantity, unitPrice));
    }

    void confirm() {
        if (lines.isEmpty()) throw new IllegalStateException("pedido vazio");
        confirmed = true;
    }

    // Total derivado: não existe campo total para divergir das linhas.
    Money total() {
        return lines.stream()
                .map(l -> l.unitPrice().times(l.quantity()))
                .reduce(new Money(0), Money::plus);
    }

    List<Line> lines() { return List.copyOf(lines); }

    record Line(Sku sku, int quantity, Money unitPrice) { }
}
```

### Context map

O mapa de contextos registra como as fronteiras se relacionam: parceria, shared kernel, customer-supplier, conformist, anti-corruption layer (ACL), open host service. O padrão mais útil no dia a dia é a ACL: uma camada que traduz o modelo externo para o seu, impedindo que nomes como `cod_cli` e `situacao = "A"` vazem para o domínio.

```java
record CustomerId(String value) { }
record Customer(CustomerId id, String legalName, boolean active) { }

// Linha do legado: nomes e códigos que não devem entrar no domínio.
record LegacyCustomerRow(String codCli, String razaoSocial, String situacao) { }

final class CustomerTranslator {
    Customer translate(LegacyCustomerRow row) {
        if (row.codCli() == null || row.codCli().isBlank()) {
            throw new IllegalArgumentException("código de cliente ausente");
        }
        boolean active = switch (row.situacao()) {
            case "A" -> true;
            case "I", "B" -> false;
            default -> throw new IllegalStateException("situação desconhecida: " + row.situacao());
        };
        return new Customer(new CustomerId("C-" + row.codCli()), row.razaoSocial(), active);
    }
}
```

A ACL custa código e latência. Ela evita que uma mudança no legado vire uma mudança em 40 classes do seu domínio — e é isso que você está comprando.

## Na prática

Descubra fronteiras com event storming: liste eventos de negócio no passado ("PedidoConfirmado", "PagamentoRecusado"), agrupe por quem se importa e observe onde a mesma palavra muda de sentido. Depois valide com três testes:

- **Teste da linguagem:** duas pessoas usam o termo com definições incompatíveis? Fronteira.
- **Teste da mudança:** o módulo muda por motivos diferentes dos vizinhos? Fronteira.
- **Teste de dados:** quem é o dono da escrita? Se dois times escrevem na mesma tabela, não há fronteira.

Quando não usar DDD: CRUD, domínios simples, subdomínios genéricos (autenticação, e-mail, pagamento de terceiros). DDD tático sem DDD estratégico produz agregados bonitos e fronteiras erradas.

## Armadilhas comuns

- **Uma entidade por tabela.** O modelo de domínio não é o schema; o schema é uma implementação.
- **Agregado como grafo de objetos.** Carregar o cliente dentro do pedido cria um agregado gigante e locks desnecessários.
- **Shared kernel em todo lugar.** Dois times alterando o mesmo modelo compartilhado é acoplamento com outro nome.
- **Agregado pequeno demais.** Se toda operação precisa de saga, você pagou complexidade sem necessidade.
- **DDD como camada de pastas.** `domain/`, `infra/`, `application/` sem linguagem ubíqua é só organização.

## Checklist de domínio

- [ ] Você distingue subdomínio, bounded context e serviço
- [ ] Você justifica o limite de um agregado por invariantes
- [ ] Você desenha uma ACL para um modelo legado
- [ ] Você identifica o mesmo termo com significados diferentes em dois contextos
- [ ] Você decide quando DDD não é a ferramenta

## Para ir além

- [BoundedContext](https://martinfowler.com/bliki/BoundedContext.html) — a definição curta e precisa.
- [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html) — panorama com os conceitos estratégicos e táticos.
- [Database per Service](https://microservices.io/patterns/data/database-per-service.html) — por que a posse do dado acompanha a fronteira.
