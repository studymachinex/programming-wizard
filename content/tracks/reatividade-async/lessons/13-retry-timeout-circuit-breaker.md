> **Em uma frase:** timeout, retry e circuit breaker resolvem problemas diferentes; combiná-los sem definir a ordem é criar uma política que ninguém consegue prever.

Timeout limita uma tentativa. Retry decide quantas vezes você insiste. Circuit breaker decide quando parar de insistir. Bulkhead limita quantas chamadas existem ao mesmo tempo. Fallback define o que devolver quando tudo falha. Cada um tem um custo, e a composição precisa ser deliberada.

## O problema

Uma dependência começa a responder em 5 segundos. O cliente tem timeout de 10, então espera. O retry tenta três vezes: 15 segundos no pior caso. O chamador tinha timeout de 4 segundos e já desistiu; o servidor continua trabalhando para uma resposta que ninguém vai ler. Enquanto isso, cada requisição ocupa uma conexão e uma thread, e o retry multiplica a carga justamente sobre o serviço degradado.

Sem circuit breaker, o padrão se repete até o pool esgotar. Sem classificação de erro, um `400` de validação é repetido três vezes. Sem idempotência, um timeout de cobrança vira duas cobranças.

## Como funciona

O SmallRye Fault Tolerance implementa as anotações do MicroProfile e suporta `Uni` nativamente — sem precisar de `@Asynchronous`. A ordem de intercepção, de fora para dentro, é: fallback, bulkhead, circuit breaker, retry, timeout. Isso significa que cada tentativa do retry tem seu próprio timeout; se o timeout ficasse por fora, uma única tentativa lenta consumiria o orçamento inteiro e o retry nunca aconteceria.

| Estratégia | Protege contra | Custo | Cuidado principal |
|---|---|---|---|
| `@Timeout` | Chamada pendurada | Recurso preso até o prazo | Precisa ser menor que o deadline do chamador |
| `@Retry` | Falha transitória | Multiplica carga e latência | Só em operação idempotente |
| `@CircuitBreaker` | Dependência degradada | Falha rápida para quem chama | Janela e threshold mal calibrados |
| `@Bulkhead` | Esgotamento de capacidade | Rejeição | Filas e pools dimensionados |
| `@Fallback` | Experiência degradada | Pode esconder a falha | Não engolir erro permanente |

`@Retry(maxRetries = 2)` são duas novas tentativas, três execuções no total. O `delay` padrão é zero, o que produz uma rajada; use backoff e jitter. `@CircuitBreaker` conta falhas em uma janela de `requestVolumeThreshold` chamadas e abre quando a proporção passa de `failureRatio`; em aberto, lança `CircuitBreakerOpenException` sem tocar na dependência. Depois de `delay`, entra em half-open e testa algumas chamadas.

A classificação de erro é parte da política. Timeout, `IOException`, `503` e conexão recusada são candidatos a retry. `400`, `401`, `403`, `404`, validação e regra de negócio não são: a próxima tentativa produz o mesmo resultado. Use `retryOn` e `abortOn` para tornar isso explícito, em vez de repetir tudo por padrão.

## Na prática

```java
package com.exemplo.pagamento;

import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.IOException;
import java.time.temporal.ChronoUnit;
import org.eclipse.microprofile.faulttolerance.CircuitBreaker;
import org.eclipse.microprofile.faulttolerance.Fallback;
import org.eclipse.microprofile.faulttolerance.Retry;
import org.eclipse.microprofile.faulttolerance.Timeout;

@ApplicationScoped
public class PagamentoService {

    private final GatewayPagamento gateway;

    public PagamentoService(GatewayPagamento gateway) {
        this.gateway = gateway;
    }

    @Timeout(value = 800, unit = ChronoUnit.MILLIS)
    @Retry(maxRetries = 2, delay = 100, jitter = 50,
           retryOn = IOException.class,
           abortOn = PagamentoRecusadoException.class)
    @CircuitBreaker(requestVolumeThreshold = 20, failureRatio = 0.5,
                    delay = 10, delayUnit = ChronoUnit.SECONDS,
                    successThreshold = 2)
    @Fallback(fallbackMethod = "pendente",
              skipOn = PagamentoRecusadoException.class)
    public Uni<Autorizacao> autorizar(Pagamento pagamento) {
        return gateway.autorizar(pagamento);
    }

    Uni<Autorizacao> pendente(Pagamento pagamento) {
        return Uni.createFrom().item(Autorizacao.pendente(pagamento.id()));
    }
}
```

O fallback devolve um estado que o negócio entende (`pendente`) em vez de `null` ou de uma autorização falsa. `skipOn` deixa a recusa de negócio subir intacta: ela não é falha de infraestrutura e não deve virar pendência. O método de fallback precisa ter a mesma assinatura e o mesmo tipo de retorno do método protegido; se ele chamar o método original, você cria recursão.

A política também pode ser ajustada sem recompilar:

```properties
quarkus.fault-tolerance."com.exemplo.pagamento.PagamentoService/autorizar".timeout.value=800
quarkus.fault-tolerance."com.exemplo.pagamento.PagamentoService/autorizar".retry.max-retries=2
quarkus.fault-tolerance."com.exemplo.pagamento.PagamentoService/autorizar".circuit-breaker.request-volume-threshold=20

# formato da especificação MicroProfile, também aceito
mp.fault-tolerance.com.exemplo.pagamento.PagamentoService/autorizar.retry.maxRetries=3
```

O Quarkus prioriza a chave nativa quando as duas existem. Em produção, configure por ambiente: o timeout aceitável no celular não é o mesmo do batch noturno.

Como o circuit breaker fica por fora do retry, ele observa o resultado final da sequência: uma chamada que falha duas vezes e funciona na terceira conta como um sucesso para a janela, não como duas falhas. Isso mede a saúde percebida pelo chamador, mas pode mascarar uma taxa de falha alta. Monitore tentativas separadamente das chamadas ao breaker.

Se você usa Mutiny puro, sem a extensão de fault tolerance, o timeout cabe na própria cadeia:

```java
return gateway.autorizar(pagamento)
    .ifNoItem().after(Duration.ofMillis(800)).fail();
```

O `fail()` produz um `TimeoutException` e cancela a fonte. É útil, mas não substitui a política completa: não há retry, breaker nem fallback declarativos, e você precisa repetir a configuração em cada chamada.

## Armadilhas comuns

- Retry fora do timeout: uma tentativa lenta consome o orçamento de todas.
- `maxRetries` alto com `delay` zero: rajada contra um serviço já saturado.
- Retry em `POST` de pagamento sem chave de idempotência: cobrança duplicada.
- Circuit breaker com janela de 1 chamada: abre e fecha por ruído.
- Fallback que devolve sucesso falso e esconde indisponibilidade.
- `@Fallback` capturando `400` e transformando erro de contrato em resposta `200`.

## Checklist de domínio

- [ ] Sei a ordem em que as estratégias são aplicadas e por quê.
- [ ] Meu timeout é menor que o deadline de quem me chama.
- [ ] Limito tentativas, uso backoff e jitter, e tenho um orçamento total.
- [ ] Não faço retry de 4xx nem de operação não idempotente sem chave.
- [ ] Sei o que o circuit breaker faz nos estados closed, open e half-open.
- [ ] Meu fallback é semanticamente honesto e observável.

## Para ir além

Leia o guia de fault tolerance do Quarkus e a referência do SmallRye sobre configuração. Depois rode um teste com um gateway que falha nas duas primeiras chamadas e prove que o retry recupera sem abrir o circuito.

- [Quarkus — SmallRye Fault Tolerance](https://quarkus.io/guides/smallrye-fault-tolerance)
- [SmallRye Fault Tolerance](https://smallrye.io/docs/smallrye-fault-tolerance/6.11.4/index.html)
- [Java 21 — CompletableFuture](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
