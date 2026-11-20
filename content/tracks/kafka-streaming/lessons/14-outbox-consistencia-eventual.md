> **Em uma frase:** outbox é a ponte entre o commit do banco e o publish no Kafka; sem ela, você escolhe entre perder evento ou publicar fantasma.

O padrão já foi apresentado em sistemas distribuídos. Nesta trilha, o foco é a implementação robusta: tabela, relay, ordenação, idempotência e operação. É o padrão que mais aparece em entrevistas de backend sênior.

## O problema

Um serviço grava o pedido e publica `PedidoCriado`. Entre as duas operações, o processo pode morrer. Se publicar antes, o consumidor pode processar um pedido que não existe. Se publicar depois, o evento pode nunca sair. Não há transação distribuída entre PostgreSQL e Kafka.

## Como funciona

Tabela outbox na mesma transação:

```sql
CREATE TABLE outbox (
  id bigint generated always as identity primary key,
  aggregate_id text not null,
  tipo text not null,
  payload jsonb not null,
  headers jsonb,
  criado_em timestamptz not null default now(),
  publicado_em timestamptz
);
CREATE INDEX outbox_pendentes ON outbox (id) WHERE publicado_em IS NULL;
```

Relay com `SELECT ... FOR UPDATE SKIP LOCKED` permite múltiplos workers sem duplicar:

```java
@Transactional
public void publicarLote() {
    var pendentes = jdbc.queryForList("""
        SELECT id, aggregate_id, tipo, payload
        FROM outbox
        WHERE publicado_em IS NULL
        ORDER BY id
        LIMIT 100
        FOR UPDATE SKIP LOCKED
        """);
    for (var row : pendentes) {
        kafka.send(topico(row), chave(row), payload(row));
        jdbc.update("UPDATE outbox SET publicado_em = now() WHERE id = ?", row.get("id"));
    }
}
```

## Na prática

Marque como publicado somente após o ACK do broker. Se o ACK falhar, a linha continua pendente e será reenviada; o consumidor precisa ser idempotente.

Ordenação: use `aggregate_id` como chave de partição. O relay pode publicar fora de ordem se houver múltiplos workers; para ordem estrita por agregado, particione o relay pela chave.

CDC com Debezium elimina polling e reduz latência, mas adiciona operação. Polling a cada 500 ms é suficiente para muitos casos.

Limpeza: arquive linhas publicadas após alguns dias. Monitore lag do outbox e tamanho da tabela.

## Armadilhas comuns

- Publicar fora da transação e achar que é atômico.
- Marcar como publicado antes do ACK.
- Relay single-thread virando gargalo.
- Sem índice em pendentes: varredura crescente.
- Consumidor não idempotente.

## Checklist de domínio

- [ ] Implemento outbox na mesma transação.
- [ ] Uso SKIP LOCKED para concorrência.
- [ ] Garanto ordem por agregado.
- [ ] Consumidor deduplica.
- [ ] Monitoro lag e limpo a tabela.

## Para ir além

Leia o padrão transactional outbox em microservices.io e a documentação do Debezium. Depois simule falha entre commit e publish e prove que o evento sai.
