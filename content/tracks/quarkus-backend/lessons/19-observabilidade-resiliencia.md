> **Em uma frase:** observabilidade é responder “o que está lento, para quem e por quê” sem adivinhar; resiliência é impedir que uma dependência lenta derrube o resto — e as duas precisam de limites explícitos.

## O problema

O alerta dispara: “API de pedidos com erro 500”. O dashboard mostra CPU normal, o banco responde, o gateway não acusa nada. O time abre o log e encontra `TimeoutException` em uma chamada ao serviço de estoque. Não há trace para saber qual requisição, qual cliente e qual instância; a métrica de latência é uma média que esconde o p99; o health check de liveness consulta o banco e reinicia todos os pods quando o banco oscila.

Em outro incidente, o serviço de estoque fica lento. A API de pedidos tenta de novo três vezes, cada tentativa espera 30 segundos, o pool de conexões satura e o serviço inteiro cai — inclusive endpoints que não dependem de estoque. O retry sem timeout e sem breaker transformou uma dependência degradada em indisponibilidade total.

Observabilidade e resiliência são o mesmo exercício de engenharia de limites: medir o que importa, definir quanto tempo esperar, quantas vezes tentar, quando parar e como falhar de forma degradada. Sem isso, você tem dashboards bonitos e nenhuma capacidade de diagnóstico.

## Como funciona

**Os três sinais.** Métricas respondem “quanto e com que frequência” em séries temporais; logs respondem “o que aconteceu nesta requisição”; traces respondem “onde o tempo foi gasto e qual serviço falhou”. Nenhum substitui o outro. Uma métrica de erro sem trace diz que há problema, não onde; um trace sem métrica não mostra tendência.

**Health checks.** No Kubernetes, os probes têm papéis distintos:

| Probe | Pergunta | O que fazer se falhar |
|---|---|---|
| Liveness | O processo está travado e precisa reiniciar? | Reiniciar o pod |
| Readiness | Pode receber tráfego agora? | Remover do balanceador |
| Startup | A aplicação já terminou de subir? | Esperar; não reiniciar cedo |

Liveness deve ser local e barato: event loop responsivo, thread pool não esgotado, estado interno fatal. Se liveness consulta o banco, uma oscilação de rede reinicia todos os pods e piora o incidente. Readiness pode consultar dependências essenciais, mas com timeout curto e cuidado para não criar um efeito de cascata: se todos os pods dependem do mesmo banco, todos ficam fora ao mesmo tempo.

O Quarkus expõe `/q/health/live`, `/q/health/ready` e `/q/health/started` com SmallRye Health. Um check de readiness para o banco:

```java
package com.exemplo.observabilidade;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.eclipse.microprofile.health.HealthCheck;
import org.eclipse.microprofile.health.HealthCheckResponse;
import org.eclipse.microprofile.health.Readiness;

@Readiness
@ApplicationScoped
public class BancoReady implements HealthCheck {

    @Inject
    DataSource dataSource;

    @Override
    public HealthCheckResponse call() {
        try (var conexao = dataSource.getConnection();
             var comando = conexao.createStatement()) {
            comando.execute("select 1");
            return HealthCheckResponse.named("banco").up().build();
        } catch (SQLException e) {
            return HealthCheckResponse.named("banco").down()
                    .withData("erro", e.getClass().getSimpleName())
                    .build();
        }
    }
}
```

Não coloque detalhes sensíveis no corpo do health check: ele é público para o cluster e às vezes para a internet. “down” basta; o detalhe vai para o log.

**Métricas com cardinalidade controlada.** Cada combinação de nome e tags vira uma série temporal. `pedido.id` como tag cria milhões de séries e derruba o Prometheus. Use dimensões limitadas: rota (template, não URL crua), status HTTP, método, região, tipo de operação. Ids, e-mails e valores livres ficam em logs e traces.

```java
package com.exemplo.observabilidade;

import io.micrometer.core.instrument.MeterRegistry;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class MetricasPedido {

    @Inject
    MeterRegistry registry;

    public void criado(String canal) {
        registry.counter("pedidos.criados", "canal", canal).increment();
    }

    public <T> T medirProcessamento(String tipo, java.util.function.Supplier<T> operacao) {
        return registry.timer("pedido.processamento", "tipo", tipo).record(operacao);
    }
}
```

Meça latência com percentis (p50, p95, p99), não só média. A média esconde a cauda que o usuário sente. Meça saturação: pool de conexões, fila, heap, threads bloqueadas. E meça negócio: pedidos criados, pagamentos aprovados, estoque indisponível. Uma API saudável tecnicamente pode estar perdendo receita.

**Tracing distribuído.** O OpenTelemetry propaga `traceparent` entre serviços. Configure o exportador OTLP e o nome do serviço:

```properties
quarkus.otel.exporter.otlp.endpoint=http://otel-collector:4317
quarkus.otel.service.name=pedidos-api
quarkus.otel.traces.sampler=parentbased_traceidratio
quarkus.otel.traces.sampler.arg=0.1
```

Amostrar 10% em produção é comum; o collector pode fazer tail sampling para manter 100% dos erros e das requisições lentas. Não amostre antes de saber o que quer investigar. Em logs, inclua `traceId` e `spanId` para correlacionar:

```properties
quarkus.log.console.format=%d{yyyy-MM-dd HH:mm:ss} %-5p [%c{2.}] (%t) traceId=%X{traceId} spanId=%X{spanId} %s%e%n
```

**Resiliência.** A ordem de composição do MicroProfile Fault Tolerance é: `@Fallback` → `@Retry` → `@CircuitBreaker` → `@Timeout` → `@Bulkhead` → método. Consequências práticas:

- O timeout vale para **cada tentativa**, não para o total do retry.
- O breaker fica dentro do retry; cada tentativa passa por ele.
- O fallback é o último recurso, depois de todas as políticas.

```java
package com.exemplo.estoque;

import java.io.IOException;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.TimeoutException;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.faulttolerance.CircuitBreaker;
import org.eclipse.microprofile.faulttolerance.Fallback;
import org.eclipse.microprofile.faulttolerance.Retry;
import org.eclipse.microprofile.faulttolerance.Timeout;
import org.eclipse.microprofile.faulttolerance.exceptions.CircuitBreakerOpenException;

@ApplicationScoped
public class EstoqueClient {

    @Timeout(value = 800, unit = ChronoUnit.MILLIS)
    @Retry(maxRetries = 2, delay = 200, jitter = 100,
            retryOn = {IOException.class, TimeoutException.class},
            abortOn = CircuitBreakerOpenException.class)
    @CircuitBreaker(requestVolumeThreshold = 20, failureRatio = 0.5,
            successThreshold = 2, delay = 5000)
    @Fallback(fallbackMethod = "estoqueIndisponivel")
    public Estoque consultar(Long produtoId) {
        return chamarServicoExterno(produtoId);
    }

    Estoque estoqueIndisponivel(Long produtoId) {
        return Estoque.desconhecido(produtoId);
    }

    private Estoque chamarServicoExterno(Long produtoId) {
        // client HTTP com timeout de conexão e leitura
        return null;
    }
}
```

O `@Timeout` de 800 ms impede que uma chamada presa segure a thread por 30 segundos. O retry tem limite e backoff com jitter para não sincronizar todos os clientes no mesmo instante. O breaker abre após 50% de falhas em 20 chamadas e fica aberto por 5 segundos; quando abre, o fallback responde “indisponível” em vez de propagar erro. O `abortOn` evita que o retry insista em um breaker aberto.

Fallback não é desculpa para esconder falha. Se o estoque é obrigatório para fechar o pedido, devolver “indisponível” pode ser correto; se a resposta precisa ser exata, o fallback deve falhar com um erro de negócio claro. Registre métrica e log quando o fallback é acionado; um fallback silencioso vira dívida invisível.

**O que alertar.** Alerte sintoma, não causa: taxa de erro, latência p99 acima do SLO, saturação do pool, fila crescendo. Um alerta para cada exceção gera ruído e ninguém olha. Use error budget: se o SLO é 99,9%, o alerta dispara quando o orçamento está sendo consumido rápido, não a cada 500 isolado.

## Na prática

Um health check de readiness que não derruba o serviço inteiro quando o banco oscila:

```properties
quarkus.smallrye-health.root-path=/q/health
quarkus.smallrye-health.ui.enable=false
```

O Kubernetes usa os caminhos padrão:

```yaml
livenessProbe:
  httpGet:
    path: /q/health/live
    port: 8080
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /q/health/ready
    port: 8080
  periodSeconds: 5
  failureThreshold: 2
startupProbe:
  httpGet:
    path: /q/health/started
    port: 8080
  failureThreshold: 30
  periodSeconds: 2
```

O `startupProbe` dá tempo para a JVM e as migrations; sem ele, o liveness pode reiniciar o pod antes de a aplicação terminar de subir. O `failureThreshold` do readiness deve ser maior que a janela de uma oscilação transitória para não tirar todos os pods ao mesmo tempo.

Um painel mínimo:

- Latência p50/p95/p99 por rota.
- Taxa de erro por status e por dependência.
- Pool de conexões: ativas, idle, pendentes.
- Saturação de CPU, heap e threads bloqueadas.
- Pedidos criados, pagamentos aprovados, fallbacks acionados.
- Traces lentos com atributos de rota, status e serviço.

Não colete tudo. Cada métrica tem custo de armazenamento e cada tag tem custo de cardinalidade. Comece pelas perguntas que você faz durante um incidente e adicione o resto quando a pergunta aparecer.

## Armadilhas comuns

- **Liveness consultando o banco.** Uma oscilação reinicia todos os pods e transforma um problema de dependência em indisponibilidade total.
- **Readiness sem timeout.** O probe fica pendurado, o Kubernetes considera falha e remove o pod; o efeito é parecido com o de liveness.
- **Métrica com id na tag.** Cardinalidade explode e o Prometheus fica lento ou fora de memória. Use rota template e dimensões controladas.
- **Média em vez de percentil.** A média de 50 ms pode esconder 5% de requisições em 5 segundos.
- **Retry sem timeout.** Cada tentativa pode levar 30 segundos; três tentativas seguram a thread por 90 segundos e saturam o pool.
- **Retry em erro não transitório.** 400, 401 e 404 não melhoram com retry; `abortOn` ou `retryOn` específico evita desperdício.
- **Breaker sem fallback ou sem métrica.** O breaker protege, mas o usuário recebe 500 sem explicação; e você não sabe que ele abriu.
- **Fallback que engole tudo.** Um fallback genérico para qualquer exceção esconde bug de programação. Aplique em falhas de disponibilidade e registre o caminho.
- **Trace com PII.** Não coloque e-mail, token ou corpo completo em atributos de span; traces são exportados para terceiros.
- **Amostragem cega.** 1% pode não capturar o erro raro; tail sampling no collector preserva o que importa.

## Checklist de domínio

- [ ] Você separa liveness, readiness e startup e não coloca dependência externa em liveness
- [ ] Você mede p95/p99 e saturação, não apenas média e CPU
- [ ] Você controla cardinalidade e sabe por que id não é tag
- [ ] Você propaga trace entre serviços e correlaciona logs por `traceId`
- [ ] Você configura timeout antes de retry e entende que o timeout vale por tentativa
- [ ] Você usa breaker com fallback explícito e registra quando ele abre
- [ ] Você alerta por sintoma e SLO, não por cada exceção
- [ ] Você revisa o custo de retenção e amostragem antes de ligar tudo

## Para ir além

- [Quarkus — SmallRye Health](https://quarkus.io/guides/smallrye-health)
- [Quarkus — Micrometer](https://quarkus.io/guides/micrometer)
- [Quarkus — OpenTelemetry](https://quarkus.io/guides/opentelemetry)
- [Quarkus — SmallRye Fault Tolerance](https://quarkus.io/guides/smallrye-fault-tolerance)
- [Google SRE — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
