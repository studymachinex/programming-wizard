> **Em uma frase:** timeout é uma pergunta sem resposta — a operação pode ter acontecido. Idempotência com chave estável torna a repetição segura; jitter impede que os retries virem um ataque.

## O problema

O checkout chama o gateway de pagamento e recebe timeout após 2 s. O cliente tenta de novo. A primeira cobrança foi processada, mas a resposta se perdeu; agora o cartão foi debitado duas vezes. O suporte descobre dias depois; o estorno custa mais que a venda.

O padrão aparece em todo `POST`: criar pedido, enviar e-mail, debitar conta. Timeout não diz "não aconteceu"; diz "não sei". Sem chave reconhecida pelo servidor, cada tentativa é nova operação.

## Como funciona

### Idempotência de verdade

Idempotência significa que repetir a mesma requisição produz o mesmo efeito final. `GET`, `PUT` e `DELETE` são idempotentes por semântica HTTP; `POST` não é. Para tornar um `POST` seguro, o cliente gera uma **chave de idempotência** (UUID) antes da primeira tentativa e a reenvia em todas. O servidor grava, na mesma transação do efeito, a chave, um fingerprint do payload e a resposta produzida.

As regras:

- mesma chave + mesmo payload → replay da resposta original, inclusive o status;
- mesma chave + payload diferente → `409 Conflict` ou `422`, nunca executa de novo;
- chave em processamento → `409` ou espera curta, nunca executa em paralelo;
- TTL maior que a janela de retry do cliente (24 h é comum).

Sem o fingerprint, um cliente que reutiliza chave recebe a resposta de outro pedido.

```java
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

final class Idempotencia {
    record Resposta(int status, String corpo, String fingerprint) {}

    private final Map<String, CompletableFuture<Resposta>> execucoes = new ConcurrentHashMap<>();

    // A chave vem do cliente e é estável entre tentativas; o fingerprint detecta corpo diferente.
    Resposta executar(String chave, String corpo, Supplier<Resposta> acao) {
        String fingerprint = sha256(corpo);
        CompletableFuture<Resposta> nova = new CompletableFuture<>();
        CompletableFuture<Resposta> existente = execucoes.putIfAbsent(chave, nova);

        if (existente != null) {
            Resposta r = existente.join(); // em produção, aguarde com timeout e trate TTL
            if (!r.fingerprint().equals(fingerprint)) {
                throw new IllegalStateException("payload diferente para a mesma chave");
            }
            return r; // replay da resposta original
        }

        try {
            Resposta r = acao.get();
            nova.complete(r);
            return r;
        } catch (RuntimeException e) {
            execucoes.remove(chave, nova); // falha transitória permite nova tentativa
            nova.completeExceptionally(e);
            throw e;
        }
    }

    private static String sha256(String valor) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(valor.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
```

Em produção, troque o mapa por tabela com `unique (cliente_id, chave)`. Inserir a chave e aplicar o efeito precisam ocorrer na mesma transação local; senão, você recriou o dual-write.

### Retry que não amplifica

Retry só vale para falha transitória: recusa, reset, timeout, `429`, `503`, `504`. `400`, `401`, `404` e `422` não melhoram com repetição. E precisa de três limites: tentativas, tempo e volume.

- **Backoff exponencial**: 100 ms, 200 ms, 400 ms, 800 ms, 1,6 s.
- **Full jitter**: `random(0, min(cap, base × 2^tentativa))`; sem ele, 10 mil clientes que falharam juntos voltam juntos.
- **Orçamento**: no máximo 10% das requisições podem virar retry. Com a dependência 50% degradada, o orçamento acaba e você falha rápido.
- **Deadline**: a soma das tentativas cabe no tempo restante do chamador.

```java
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

final class RetryComOrcamento {
    private final AtomicLong chamadas = new AtomicLong();
    private final int retriesPorCem;

    RetryComOrcamento(int retriesPorCem) {
        this.retriesPorCem = retriesPorCem;
    }

    <T> T executar(Supplier<T> chamada, int maxTentativas, long deadlineNanos)
            throws InterruptedException {
        long base = 100; // ms
        for (int tentativa = 0; ; tentativa++) {
            try {
                return chamada.get();
            } catch (RuntimeException e) {
                boolean ultima = tentativa == maxTentativas - 1;
                if (!transitoria(e) || ultima || !temOrcamento()) {
                    throw e;
                }
                long teto = Math.min(2_000, base << Math.min(tentativa, 5));
                long esperaMs = ThreadLocalRandom.current().nextLong(teto + 1); // full jitter
                if (System.nanoTime() + esperaMs * 1_000_000 > deadlineNanos) {
                    throw e; // o chamador já desistiu
                }
                Thread.sleep(esperaMs);
            }
        }
    }

    // Orçamento simplificado: libera um retry a cada N chamadas.
    private boolean temOrcamento() {
        return chamadas.incrementAndGet() % (100 / retriesPorCem) == 0;
    }

    private boolean transitoria(RuntimeException e) {
        return e instanceof java.io.IOException || e instanceof FalhaTransienteException;
    }
}
```

## Na prática

Com 10 mil req/s e 1% de falha, cinco tentativas produzem ~500 chamadas extras por segundo — administrável. Se três camadas repetirem três vezes, o pior caso é `3^3 = 27` chamadas por requisição; com cinco camadas, `3^5 = 243`. O backend não cai pela falha original, cai pela amplificação.

Concentre o retry em um único ponto da pilha; as camadas de baixo apenas falham. Meça `retries_total / requests_total`: quando passa do orçamento, o problema é a dependência, não o cliente.

## Armadilhas comuns

- **Gerar a chave dentro do loop.** Cada tentativa vira operação nova. Gere uma vez, antes da primeira chamada.
- **Dedupe em memória local.** Com três pods, a chave chega em máquinas diferentes; use armazenamento compartilhado com unicidade.
- **Salvar a chave depois do efeito.** Se o processo cair entre os dois, a repetição executa de novo. Salve os dois na mesma transação.
- **Retry sem deadline.** As tentativas continuam depois que o chamador desistiu; o trabalho vira desperdício.
- **Backoff sincronizado.** Sem jitter, todos voltam no mesmo milissegundo e derrubam a dependência em recuperação.
- **Ignorar `Retry-After`.** O servidor já disse quando voltar; respeite ou será bloqueado.

## Checklist de domínio

- [ ] Você distingue timeout ambíguo de falha definitiva
- [ ] Você implementa chave de idempotência com fingerprint e replay
- [ ] Você calcula a amplificação de retries em várias camadas
- [ ] Você aplica full jitter, teto e orçamento
- [ ] Você garante que a soma das tentativas cabe no deadline do chamador

## Para ir além

- [Idempotent Consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html) — deduplicação com armazenamento compartilhado.
- [Resilience4j Retry](https://resilience4j.readthedocs.io/en/docs/retry.html) — configuração de tentativas, backoff e predicates.
- [CircuitBreaker](https://martinfowler.com/bliki/CircuitBreaker.html) — o padrão que impede retries de afundar a dependência.
