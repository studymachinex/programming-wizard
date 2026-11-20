> **Em uma frase:** Observer permite que um fato de domínio seja publicado para vários interessados sem que o publicador conheça as classes concretas deles — mas, em processo, o evento vive e morre junto com a transação.

## O problema

Ao criar um pedido, o serviço faz quatro coisas: salva, envia e-mail de confirmação, baixa estoque e credita pontos de fidelidade. Na semana seguinte, o time de dados pede um evento para o analytics. Na outra, o marketing quer notificar o cliente no WhatsApp. Cada interessado novo exige editar o mesmo método e recompilar o núcleo de pedidos.

Quando o servidor de e-mail cai, o pedido não é criado — embora o pagamento já tenha sido aprovado. O acoplamento não é só de código: é de disponibilidade. Uma falha em um efeito colateral derruba a operação principal. E o teste do caso de uso precisa mockar quatro colaboradores que não têm nada a ver com a regra de criar pedido.

## Como funciona

O publicador (subject) mantém uma lista de observadores atrás de uma interface. Ao publicar, ele itera a lista e chama o método do contrato, passando um evento com os dados do fato. O publicador não conhece e-mail, estoque ou analytics; conhece apenas `OuvintePedido`.

O evento deve ser um **fato no passado**, imutável e com dados suficientes para o ouvinte decidir. `PedidoCriado` é melhor que `CriarPedido`, porque descreve algo que já aconteceu e não carrega a intenção de alterar o estado de novo.

Antes, o caso de uso conhece todos os efeitos:

```java
record Pedido(long id, long clienteId, long totalCentavos) {}
interface PedidoRepository { void salvar(Pedido pedido); }
interface Email { void confirmar(Pedido pedido); }
interface Estoque { void baixar(Pedido pedido); }
interface Fidelidade { void creditar(Pedido pedido); }

class CriarPedidoAntigo {
    private final PedidoRepository repositorio;
    private final Email email;
    private final Estoque estoque;
    private final Fidelidade fidelidade;

    CriarPedidoAntigo(PedidoRepository repositorio, Email email,
                      Estoque estoque, Fidelidade fidelidade) {
        this.repositorio = repositorio;
        this.email = email;
        this.estoque = estoque;
        this.fidelidade = fidelidade;
    }

    void executar(Pedido pedido) {
        repositorio.salvar(pedido);
        email.confirmar(pedido);   // se falhar, o pedido já foi salvo
        estoque.baixar(pedido);    // e os próximos efeitos não rodam
        fidelidade.creditar(pedido);
    }
}
```

Depois, um barramento síncrono isola o publicador dos interessados:

```java
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.logging.Level;
import java.util.logging.Logger;

record PedidoCriado(long pedidoId, long clienteId, long totalCentavos) {}

interface OuvintePedido {
    void aoCriar(PedidoCriado evento);
}

final class BarramentoPedido {
    private static final Logger LOG = Logger.getLogger(BarramentoPedido.class.getName());
    private final List<OuvintePedido> ouvintes = new CopyOnWriteArrayList<>();

    void registrar(OuvintePedido ouvinte) {
        ouvintes.add(ouvinte);
    }

    void remover(OuvintePedido ouvinte) {
        ouvintes.remove(ouvinte);
    }

    void publicar(PedidoCriado evento) {
        for (OuvintePedido ouvinte : ouvintes) {
            try {
                ouvinte.aoCriar(evento);
            } catch (RuntimeException e) {
                // Um efeito colateral não impede os demais nem derruba o publicador.
                LOG.log(Level.SEVERE, "ouvinte falhou para pedido " + evento.pedidoId(), e);
            }
        }
    }
}

final class CriarPedido {
    private final PedidoRepository repositorio;
    private final BarramentoPedido barramento;

    CriarPedido(PedidoRepository repositorio, BarramentoPedido barramento) {
        this.repositorio = repositorio;
        this.barramento = barramento;
    }

    void executar(Pedido pedido) {
        repositorio.salvar(pedido);
        barramento.publicar(new PedidoCriado(
                pedido.id(), pedido.clienteId(), pedido.totalCentavos()));
    }
}
```

`CopyOnWriteArrayList` é adequada porque registro e remoção são raros e a publicação é frequente; a iteração não lança `ConcurrentModificationException`, mas cada escrita copia o array. Se o volume de registros for alto, outra estrutura é necessária.

## Na prática

Observer é a escolha certa quando **vários interessados independentes** reagem ao mesmo fato e você não quer que o núcleo saiba quem são. Também é a base de plugins e extensões: o sistema publica, o módulo externo se registra.

O custo escondido é a latência. Em um barramento síncrono, o tempo total é a soma dos ouvintes. Quatro ouvintes de 25 ms adicionam 100 ms ao checkout, e o cliente sente. Meça com percentis (p99), não com média. Se o efeito pode esperar, processe de forma assíncrona — mas aí a falha deixa de ser imediata e você precisa de retry e idempotência.

O segundo custo é o **vazamento de referência**. Um observador registrado em um publicador de vida longa nunca é removido se o objeto que o criou morre; a lista mantém tudo vivo. Em aplicações com escopo de request, registre e remova no mesmo escopo, ou use referências fracas com um contrato claro.

O terceiro é a transação. Publicar antes do commit notifica um pedido que pode ser revertido. No CDI/Quarkus, um observer com `@Observes(during = TransactionPhase.AFTER_SUCCESS)` resolve o caso local; para garantir entrega mesmo com crash, use outbox transacional e um relay para o broker.

## Armadilhas comuns

- **Propagar a exceção do ouvinte.** Um e-mail indisponível não pode cancelar um pedido pago. Capture, registre com contexto e siga; se o efeito é obrigatório, ele não pertence a um observer síncrono.
- **Depender da ordem dos ouvintes.** A lista preserva a ordem de registro, mas isso não é contrato de negócio. Ouvintes devem ser independentes entre si.
- **Publicar evento sem dados suficientes.** O ouvinte consulta o repositório e cria acoplamento temporal. Inclua os campos que o fato carrega.
- **Ignorar reentrância.** Um ouvinte que publica outro evento pode criar ciclo. Limite a profundidade ou proíba publicação dentro de ouvinte.
- **Usar Observer local para integração entre serviços.** O evento morre com o processo. Para cruzar serviços, use broker durável e consumidores idempotentes.

| Necessidade | Observer local | Mensageria durável |
|---|---|---|
| Notificar módulos no mesmo processo | sim | exagero |
| Sobreviver a crash e reprocessar | não | sim |
| Baixa latência e falha imediata | sim | não |
| Vários consumidores externos | limitado | sim |

## Checklist de domínio

- [ ] Você implementa registro, remoção e publicação com isolamento de falha
- [ ] Você explica o custo de latência de um barramento síncrono
- [ ] Você reconhece vazamento de referência e problema de transação
- [ ] Você decide quando trocar Observer local por mensageria durável

## Para ir além

- [Observer](https://refactoring.guru/design-patterns/observer) — estrutura, notificações e variantes.
- [What do you mean by “event-driven”?](https://martinfowler.com/articles/201701-event-driven.html) — tipos de evento e acoplamento.
- [Event Aggregator](https://martinfowler.com/eaaDev/EventAggregator.html) — padrão para canal único de eventos de domínio.
