> **Em uma frase:** escolher síncrono ou assíncrono é escolher quem paga a latência e quem sobrevive à falha do outro — e o contrato é o que impede essa escolha de virar acoplamento invisível.

## O problema

Um checkout chama estoque, pagamento e antifraude em série, cada um com p99 de 200 ms. O p99 da jornada é 600 ms e cresce com o número de serviços. Quando o antifraude passa a demorar 2 s, o pool de threads do checkout enche, o gateway estoura o timeout e o usuário vê erro em uma compra que o pagamento já autorizou.

O assíncrono move o problema. O usuário recebe `202 Accepted` em 80 ms, mas o pedido só é confirmado quando três consumidores processarem o evento. Com 40 minutos de lag, o suporte ouve sobre um pedido que existe no banco e não na tela.

## Como funciona

São três acoplamentos; só um é removido pelo broker:

- **Temporal**: no síncrono, o outro precisa estar vivo naquele instante. No assíncrono, o broker guarda a mensagem e o consumidor processa depois.
- **Espacial**: no síncrono, você precisa do endereço (DNS, discovery). No assíncrono, precisa do nome do tópico.
- **Semântico**: nos dois, você depende do formato — o único permanente.

### A conta do síncrono

Em série, latências somam e disponibilidades multiplicam. Dez serviços com p99 de 200 ms dão 2 s, sem retries. Oito serviços com 99,99% dão `0,9999^8 ≈ 99,92%` — 7 horas de indisponibilidade por ano em vez de 52 minutos. Em paralelo o p99 é o máximo, mas a chance de uma chamada estourar cresce: 10 dependências com 1% de falha cada dão `1 - 0,99^10 ≈ 9,6%`.

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public class CheckoutFanOut {
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(200))
            .build();

    // Orçamento de 800 ms: 600 ms para as dependências e 200 ms de folga.
    String checkout(String pedidoId) throws Exception {
        long deadline = System.nanoTime() + Duration.ofMillis(600).toNanos();
        List<CompletableFuture<String>> chamadas = List.of(
                get("/estoque/" + pedidoId, deadline),
                get("/pagamento/" + pedidoId, deadline),
                get("/fraude/" + pedidoId, deadline));

        // Se uma falhar, as outras continuam rodando: cancele explicitamente.
        CompletableFuture.allOf(chamadas.toArray(CompletableFuture[]::new))
                .get(600, TimeUnit.MILLISECONDS);
        return chamadas.stream().map(CompletableFuture::join).reduce("", String::concat);
    }

    private CompletableFuture<String> get(String path, long deadline) {
        long restanteMs = Duration.ofNanos(deadline - System.nanoTime()).toMillis();
        if (restanteMs <= 20) {
            return CompletableFuture.failedFuture(
                    new TimeoutException("orçamento esgotado antes de " + path));
        }
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://interno" + path))
                .timeout(Duration.ofMillis(restanteMs))
                .header("X-Timeout-Ms", Long.toString(restanteMs))
                .GET().build();
        return http.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenApply(HttpResponse::body);
    }
}
```

O header `X-Timeout-Ms` propaga deadline: o servidor deve recusar trabalho quando o tempo restante for menor que o custo mínimo da operação. Sem isso, o cliente desiste e o backend segue gastando CPU.

### Assíncrono não é grátis

O broker troca acoplamento temporal por consistência eventual: absorve picos (fila de 2 milhões de mensagens), mantém o consumidor fora do ar sem derrubar o produtor e reduz o aceite. Cobra com duplicatas (`at-least-once`), ordenação só por chave, lag e mensagem envenenada bloqueando a partição.

### Contratos que evoluem

A regra é assimétrica: consumidor antigo ignora campo novo; produtor novo tolera consumidor antigo. Em JSON, ignore propriedades desconhecidas. Em Protobuf, use tag nova e `reserved` nas antigas. Em Avro, o reader schema resolve com defaults. Nunca reutilize nome ou número com outro significado.

```java
import java.time.Instant;
import java.util.UUID;

// Contrato versionado: campos novos entram como opcionais e com versão explícita.
sealed interface PedidoEvent permits PedidoCriadoV1, PedidoCriadoV2 {
    UUID pedidoId();
    Instant ocorridoEm();
    int versao();
}

record PedidoCriadoV1(UUID pedidoId, Instant ocorridoEm, String clienteId)
        implements PedidoEvent {
    public int versao() {
        return 1;
    }
}

record PedidoCriadoV2(UUID pedidoId, Instant ocorridoEm, String clienteId,
                      String cupom, int versao) implements PedidoEvent {
    public PedidoCriadoV2 {
        if (versao < 2) {
            throw new IllegalArgumentException("v2 exige versão >= 2");
        }
    }

    static PedidoCriadoV2 from(PedidoCriadoV1 v1, String cupom) {
        return new PedidoCriadoV2(v1.pedidoId(), v1.ocorridoEm(), v1.clienteId(), cupom, 2);
    }
}

final class ConsumidorPedido {
    // Consumidor novo aceita v1 e v2; um consumidor antigo simplesmente ignora o cupom.
    void on(PedidoEvent evento) {
        String cupom = switch (evento) {
            case PedidoCriadoV2 v2 -> v2.cupom();
            case PedidoCriadoV1 v1 -> "";
        };
        System.out.printf("pedido=%s cupom=%s%n", evento.pedidoId(), cupom);
    }
}
```

## Na prática

Coreografia escala em autonomia, mas o fluxo fica invisível: ninguém responde onde está o pedido 123. Orquestração centraliza estado e diagnóstico, ao custo de um componente altamente disponível e acoplamento ao workflow. Jornadas com compensação e prazo — pedido, pagamento, viagem — pedem orquestração; reações simples — e-mail, analytics, cache — pedem coreografia.

Decida por operação: a confirmação do pagamento é síncrona porque o usuário precisa saber agora; a nota fiscal pode ser assíncrona porque ninguém espera. Registre o SLO de cada caminho e o que acontece se o evento atrasar 10 minutos.

## Armadilhas comuns

- **Assíncrono como RPC disfarçado.** Request/reply sobre fila recria o acoplamento temporal e perde o timeout simples. Se espera a resposta, use síncrono com deadline.
- **Evento sem versão.** O primeiro campo novo quebra um consumidor esquecido; versione o envelope desde o início.
- **Publicar antes do commit.** O consumidor lê um dado que ainda não existe; use outbox em vez de publicar no meio da transação.
- **Confundir entrega com processamento.** `202` significa "aceitei", não "concluí"; exponha um status consultável.
- **Coreografia sem dono do processo.** Ninguém vê o fluxo até o incidente; com prazo e compensação, use orquestrador e estado persistido.

## Checklist de domínio

- [ ] Você calcula o p99 de uma jornada em série e em paralelo
- [ ] Você explica por que 8 serviços a 99,99% não entregam 99,99%
- [ ] Você escolhe orquestração ou coreografia pelo custo de diagnóstico
- [ ] Você projeta um evento compatível com consumidores antigos e novos
- [ ] Você sabe onde propagar deadline e onde aceitar consistência eventual

## Para ir além

- [What do you mean by "event-driven"?](https://martinfowler.com/articles/201701-event-driven.html) — as quatro formas de event-driven.
- [Messaging](https://microservices.io/patterns/communication-style/messaging.html) — o padrão e seus trade-offs de acoplamento.
- [Saga](https://microservices.io/patterns/data/saga.html) — compensação no lugar da transação distribuída.
