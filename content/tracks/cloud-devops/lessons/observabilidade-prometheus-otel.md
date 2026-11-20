> **Em uma frase:** métrica diz que algo está errado, trace diz onde, log diz por quê — e sem correlação entre os três você tem três ilhas.

Prometheus coleta séries temporais; OpenTelemetry padroniza traces, métricas e logs. Juntos, respondem "qual serviço, qual operação, qual dependência" sem abrir cinco ferramentas. O pré-requisito é instrumentar com contexto propagado.

## O problema

O alerta dispara: p99 acima de 2 s. O dashboard mostra CPU normal. Os logs estão espalhados por 12 pods sem `trace_id`. Alguém começa a caçar às cegas. Com tracing, uma trace lenta mostra o span do banco com 1,8 s; o log correlacionado mostra o timeout.

## Como funciona

**Métricas:** counters, gauges, histograms. No Prometheus, nomes e labels importam. Evite label de alta cardinalidade (`user_id`); use `route`, `status`, `instance`.

```yaml
groups:
  - name: pedidos
    rules:
      - record: pedido:latencia_p99_5m
        expr: histogram_quantile(0.99,
          sum(rate(http_server_requests_seconds_bucket{app="pedidos"}[5m])) by (le))
      - alert: PedidoLatenciaAlta
        expr: pedido:latencia_p99_5m > 1.5
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "p99 acima de 1,5s há 10 minutos"
```

**OpenTelemetry em Java:** o agente auto-instrumenta HTTP, JDBC e Kafka. Spans manuais cobrem regra de negócio:

```java
private static final Tracer tracer =
    GlobalOpenTelemetry.getTracer("pedidos");

public Pedido criar(PedidoRequest req) {
    var span = tracer.spanBuilder("pedido.criar")
        .setAttribute("canal", req.canal())
        .startSpan();
    try (var scope = span.makeCurrent()) {
        var pedido = dominio.criar(req);
        span.setAttribute("pedido.id", pedido.id());
        return pedido;
    } catch (RuntimeException e) {
        span.recordException(e);
        span.setStatus(StatusCode.ERROR);
        throw e;
    } finally {
        span.end();
    }
}
```

## Na prática

Comece pelos quatro sinais de ouro: latência, tráfego, erros e saturação. Defina SLO antes dos alertas. Use histogramas com buckets adequados ao seu p99 — buckets errados tornam o quantil inútil.

Correlacione: configure o Collector para exportar traces e métricas, e injete `trace_id` no MDC dos logs. No Quarkus, `quarkus-opentelemetry` propaga o contexto e adiciona `traceId`/`spanId` ao MDC; o Micrometer cuida das métricas.

## Armadilhas comuns

- Label com ID de usuário ou URL completa: cardinalidade explode.
- Alertar em CPU em vez de sintoma do usuário.
- Span sem atributo útil: "GET /" não ajuda.
- Amostragem 100% em tráfego alto: custo proibitivo; use tail sampling para erros.
- Logs sem timestamp/contexto e sem correlação.

## Checklist de domínio

- [ ] Sei instrumentar métricas e traces em Java.
- [ ] Entendo histogramas e quantis.
- [ ] Correlaciono log, métrica e trace.
- [ ] Configuro alertas por SLO.
- [ ] Evito alta cardinalidade.

## Para ir além

Leia a documentação do OpenTelemetry para Java e as práticas de naming do Prometheus. Depois instrumente um endpoint e encontre o gargalo em uma trace.
