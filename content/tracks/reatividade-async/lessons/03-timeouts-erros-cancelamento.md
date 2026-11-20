> **Em uma frase:** timeout não cancela trabalho por mágica; ele só decide quando o future falha — cancelar de verdade exige interrupção, cooperação e uma operação subjacente que saiba parar.

Toda chamada remota precisa de prazo, mas prazo no `CompletableFuture` e prazo no cliente HTTP são coisas diferentes. Confundir os dois produz a pior combinação: a requisição estoura o tempo para o cliente, mas continua viva no servidor, consumindo conexão, thread e memória.

## O problema

Um serviço consulta a cotação do dólar em uma API externa e usa `orTimeout(1, SECONDS)`. Quando a API demora, o future falha e o usuário recebe o fallback. Parece resolvido. Só que a conexão HTTP continua aberta, o corpo ainda está chegando e, sob carga, o pool de conexões esgota. O timeout escondeu o sintoma; não interrompeu o trabalho.

Pior ainda é o retry automático: sem idempotência, repetir um `POST` de pagamento pode cobrar duas vezes. E cancelar um `CompletableFuture` não interrompe a thread que executa a tarefa, porque `cancel(true)` nele ignora o parâmetro de interrupção.

## Como funciona

`orTimeout(long, TimeUnit)` completa o future com `TimeoutException` se ele não terminar no prazo. `completeOnTimeout(valor, ...)` completa com um valor padrão. Nenhum dos dois cancela a tarefa original: ambos apenas disputam quem completa o future primeiro.

`CompletableFuture.cancel(true)` também não interrompe a thread. O javadoc é explícito: o parâmetro não tem efeito porque a implementação não usa interrupção para controlar o processamento. O future termina com `CancellationException`, e quem estiver encadeado recebe isso — mas o `ExecutorService` continua executando a tarefa.

Para interrupção real, use o `Future<?>` devolvido por `ExecutorService.submit` e um código que coopere: checar `Thread.currentThread().isInterrupted()`, propagar `InterruptedException` e liberar recursos. Bibliotecas de I/O podem ou não responder à interrupção; um `HttpClient` tem timeout próprio.

O exemplo abaixo aplica os dois níveis de prazo. O timeout do cliente aborta a requisição; o `orTimeout` limita a espera pela cadeia inteira, incluindo o parsing:

```java
package br.com.loja.cambio;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

public final class CambioClient {

    private final HttpClient http = HttpClient.newHttpClient();
    private final JsonCodec json;

    public CambioClient(JsonCodec json) {
        this.json = json;
    }

    public CompletableFuture<Cotacao> cotacao(String moeda) {
        var request = HttpRequest.newBuilder(
                URI.create("https://api.exemplo.com/cotacao/" + moeda))
            .timeout(Duration.ofMillis(700)) // limite da requisição HTTP
            .header("Accept", "application/json")
            .GET()
            .build();

        return http.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenApply(response -> json.read(response.body(), Cotacao.class))
            .orTimeout(1, TimeUnit.SECONDS) // limite da composição inteira
            .exceptionally(ex -> Cotacao.indisponivel(moeda, raiz(ex)));
    }

    private static Throwable raiz(Throwable ex) {
        while (ex.getCause() != null
                && (ex instanceof java.util.concurrent.CompletionException
                    || ex instanceof java.util.concurrent.ExecutionException)) {
            ex = ex.getCause();
        }
        return ex;
    }
}
```

Para retry com espera sem bloquear uma thread, `CompletableFuture.delayedExecutor` agenda a próxima tentativa. Note que o executor dedicado evita usar o `commonPool` para operações bloqueantes:

```java
private static final java.util.concurrent.ExecutorService RETRY_POOL =
    java.util.concurrent.Executors.newFixedThreadPool(4);

static <T> CompletableFuture<T> comRetry(Supplier<CompletableFuture<T>> operacao,
                                         int restantes, Duration espera) {
    return operacao.get().exceptionallyCompose(erro -> {
        if (restantes == 0 || !transitorio(erro)) {
            return CompletableFuture.failedFuture(erro);
        }
        var delay = CompletableFuture.delayedExecutor(
            espera.toMillis(), TimeUnit.MILLISECONDS, RETRY_POOL);
        return CompletableFuture.supplyAsync(operacao, delay)
            .thenCompose(f -> f); // achata CF<CF<T>>
    });
}

static boolean transitorio(Throwable erro) {
    var causa = erro.getCause() != null ? erro.getCause() : erro;
    return causa instanceof java.net.http.HttpTimeoutException
        || causa instanceof java.io.IOException;
}
```

| Mecanismo | Completa o future | Interrompe a tarefa | Use para |
|---|---|---|---|
| `orTimeout` | Com `TimeoutException` | Não | prazo da composição |
| `completeOnTimeout` | Com valor padrão | Não | fallback tolerável |
| `CF.cancel(true)` | Com `CancellationException` | Não | descartar o resultado |
| `Future.cancel(true)` | Com `CancellationException` | Tenta, se houver cooperação | tarefa interrompível |
| `HttpRequest.timeout` | Com `HttpTimeoutException` | Aborta a requisição | limite de rede |
| `delayedExecutor` | Agenda a execução | Não | backoff sem `sleep` |

## Na prática

Quando a operação é interrompível, o `Future` do executor é o caminho para cancelar de verdade. O `get` com prazo devolve o controle; o `cancel(true)` envia a interrupção; a tarefa precisa checar o flag e liberar recursos:

```java
Relatorio gerar() throws Exception {
    var futuro = executor.submit(() -> gerarRelatorio());
    try {
        return futuro.get(2, TimeUnit.SECONDS);
    } catch (TimeoutException e) {
        futuro.cancel(true); // interrompe se o código cooperar
        throw new RelatorioIndisponivelException("tempo esgotado", e);
    } catch (InterruptedException e) {
        futuro.cancel(true);
        Thread.currentThread().interrupt(); // preserva o estado
        throw e;
    }
}
```

Dentro de `gerarRelatorio`, verifique `Thread.currentThread().isInterrupted()` entre lotes e propague `InterruptedException` de chamadas bloqueantes. Sem essa cooperação, `cancel(true)` só marca o future; a tarefa segue até o fim.

Defina um orçamento de tempo de fora para dentro: requisição total de 2 s, composição de 1 s, cliente HTTP de 700 ms. O timeout interno precisa ser menor que o externo, senão o externo vence e você perde a chance de tratar o erro com contexto.

Separe falha de negócio de falha técnica. Um `404` ou `400` é resposta válida do domínio e não deve ser repetido. `TimeoutException`, `IOException` e `503` podem ser transitórios. Retry só faz sentido em operação idempotente ou com chave de idempotência enviada ao servidor.

`ExecutionException` aparece em `get()`; `CompletionException` aparece em `join()` e nos callbacks. Registre a causa raiz, não só “falhou”. Se você capturar `InterruptedException`, ou propague, ou restaure o flag com `Thread.currentThread().interrupt()` antes de sair.

## Armadilhas comuns

- Achar que `orTimeout` cancelou a chamada HTTP e deixar conexões vazando.
- Usar `completeOnTimeout` para status de pagamento, onde um valor velho é pior que um erro.
- Fazer retry de `POST` não idempotente e duplicar o efeito colateral.
- Repetir imediatamente, sem backoff, martelando uma dependência já degradada.
- Engolir `InterruptedException` e seguir como se nada tivesse acontecido.
- Configurar timeout só no future e esquecer o timeout do cliente.
- Logar `ExecutionException` sem a causa e perder a única informação útil.

## Checklist de domínio

- [ ] Sei a diferença entre completar excepcionalmente e cancelar o trabalho.
- [ ] Configuro timeout no cliente HTTP e na composição.
- [ ] Meus timeouts internos são menores que o orçamento externo.
- [ ] Só faço retry de operações idempotentes e com backoff.
- [ ] Trato `InterruptedException` preservando o estado de interrupção.
- [ ] Distingo `ExecutionException` de `CompletionException` na borda.

## Para ir além

Leia o javadoc de `CompletableFuture` (especialmente `orTimeout`, `completeOnTimeout` e `cancel`) e o de `HttpRequest.Builder.timeout`. Depois simule uma dependência que demora 5 s, aplique carga e confirme, com métricas de conexão, que o timeout do cliente realmente encerra a requisição.

- [Java 21 — CompletableFuture](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
- [Java 21 — HttpRequest.Builder.timeout](https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpRequest.Builder.html#timeout(java.time.Duration))
- [Java 21 — Future](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/Future.html)
