> **Em uma frase:** o Airbnb é um sistema de busca eventualmente consistente na frente de um sistema de reservas fortemente consistente, e a entrevista gira em torno de garantir zero double booking sem travar a busca.

O problema: um hóspede busca "Florianópolis, 12 a 15 de janeiro, 4 pessoas", vê preços corretos, escolhe um anúncio e reserva. Dois hóspedes nunca podem ficar com as mesmas noites do mesmo anúncio, mesmo clicando no mesmo segundo, mesmo com retry de rede e mesmo com o pagamento demorando 20 segundos.

## Requisitos

- Busca por região (mapa ou cidade), datas, hóspedes e filtros, com preço total da estadia.
- Calendário de disponibilidade por anúncio, editável pelo anfitrião.
- Preço por noite variável (fim de semana, temporada), mais taxa de limpeza e de serviço.
- Reserva com pagamento: **zero double booking** é inegociável.
- Escala de referência: ~8 milhões de anúncios ativos, picos de busca 100x maiores que o de reservas.
- Busca p99 < 500 ms. Reserva pode levar alguns segundos, mas precisa ser correta.

## Capacity estimation

O dado difícil é a disponibilidade. Em linhas `(anuncio, noite)`, são 8M × 365 ≈ **2,9 bilhões de linhas** para um ano. Como bitmap de 365 bits por anúncio, são 46 bytes, ou **~370 MB** para todos os anúncios. Isso cabe na memória do serviço de busca, e esse número muda a arquitetura: dá para filtrar disponibilidade sem ir ao banco.

Reservas: algumas centenas por segundo no pico, porque é um caminho de escrita pequeno. Buscas: dezenas de milhares por segundo. **Leitura e escrita têm escalas e exigências de consistência opostas**, e é isso que você deve dizer em voz alta.

## API

```text
GET  /busca?regiao=...&checkin=2026-01-12&checkout=2026-01-15&hospedes=4
GET  /anuncios/{id}/cotacao?checkin=...&checkout=...
POST /reservas   {anuncioId, checkin, checkout, hospedes, cotacaoId}  Idempotency-Key: <uuid>
POST /reservas/{id}/confirmar   (callback do pagamento)
```

## Arquitetura

```text
Busca:   app -> search service -> índice geo (Elasticsearch/H3) + bitmap de disponibilidade em memória
                                   ^ eventos de calendário (Kafka), atraso de segundos
Reserva: app -> booking service -> Postgres (fonte da verdade, por anúncio)
                       |-> payment service (autoriza; captura só após confirmar)
                       |-> outbox -> Kafka -> atualiza busca, notifica anfitrião
```

## Decisões e trade-offs

**Busca eventualmente consistente.** O índice de busca pode mostrar um anúncio que acabou de ser reservado. Tudo bem: a reserva confere a fonte da verdade e devolve "datas indisponíveis". O contrário, com a busca consultando o banco transacional a cada requisição, derruba o banco no pico.

**Zero double booking no banco, não na aplicação.** Um `SELECT` para conferir e depois um `INSERT` têm condição de corrida entre duas requisições. A garantia precisa estar numa restrição do banco. Há duas formas clássicas no Postgres:

```sql
-- Opção 1: uma linha por noite; a chave única impede a segunda reserva da mesma noite
CREATE TABLE noite_reservada (
  anuncio_id BIGINT NOT NULL,
  noite      DATE   NOT NULL,
  reserva_id BIGINT NOT NULL,
  PRIMARY KEY (anuncio_id, noite)
);

-- Opção 2: intervalo com exclusion constraint (precisa da extensão btree_gist)
ALTER TABLE reserva ADD CONSTRAINT sem_sobreposicao
  EXCLUDE USING gist (anuncio_id WITH =, daterange(checkin, checkout) WITH &&)
  WHERE (status IN ('PENDENTE', 'CONFIRMADA'));
```

No serviço, a violação vira um conflito de negócio, e não um erro 500:

```java
import java.sql.*;
import java.time.LocalDate;

class ReservaRepository {
    private final Connection conn;

    ReservaRepository(Connection conn) { this.conn = conn; }

    /** Insere todas as noites numa transação. Devolve false se alguma já estiver reservada. */
    boolean reservarNoites(long anuncioId, long reservaId, LocalDate checkin, LocalDate checkout) throws SQLException {
        conn.setAutoCommit(false);
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO noite_reservada (anuncio_id, noite, reserva_id) VALUES (?, ?, ?)")) {
            for (LocalDate d = checkin; d.isBefore(checkout); d = d.plusDays(1)) { // checkout não é noite
                ps.setLong(1, anuncioId);
                ps.setDate(2, Date.valueOf(d));
                ps.setLong(3, reservaId);
                ps.addBatch();
            }
            ps.executeBatch();
            conn.commit();
            return true;
        } catch (SQLException e) {
            conn.rollback();
            if (isUniqueViolation(e)) return false; // outra reserva ganhou a corrida
            throw e;
        }
    }

    private static boolean isUniqueViolation(SQLException e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof SQLException s && "23505".equals(s.getSQLState())) return true;
        }
        return false;
    }
}
```

**Reserva pendente com expiração.** O pagamento leva segundos e pode falhar. A reserva nasce `PENDENTE` com `expira_em = agora + 10 min`, já ocupando as noites. Se o pagamento confirmar, vira `CONFIRMADA`. Se não confirmar, um job libera as noites. Isso é um hold, a mesma ideia de lease do matching do Uber.

**Idempotência.** O app reenvia o `POST /reservas` se a rede cair. A `Idempotency-Key` com chave única no banco devolve a mesma reserva em vez de criar outra ou de responder "indisponível" para quem já reservou.

**Preço.** A cotação é calculada e congelada com um `cotacaoId` e validade curta. A reserva usa a cotação, e não recalcula, para o hóspede pagar exatamente o que viu.

**Particionamento.** Toda a escrita de uma reserva toca um anúncio só. Particionar o banco por `anuncio_id` mantém a transação num shard, sem transação distribuída.

## Gargalos

- **Anúncio disputado** (réveillon, evento): muitas tentativas na mesma linha. A restrição resolve a correção, e a fila por anúncio ou o rate limit resolvem a carga.
- **Atraso do índice de busca:** cresce a taxa de "indisponível" na reserva. Monitore essa taxa como SLI.
- **Holds expirados que não liberam:** noites presas sem reserva. O job de expiração precisa ser idempotente e observável.

## Checklist de resposta

- [ ] Separei busca (eventual) de reserva (forte) e justifiquei com números.
- [ ] Coloquei a garantia de não sobreposição numa restrição do banco.
- [ ] Tratei pagamento lento com reserva pendente e expiração.
- [ ] Usei chave de idempotência na criação da reserva.
- [ ] Expliquei o particionamento por anúncio.

## Para ir além

- [PostgreSQL: Exclusion Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION): a restrição de intervalo, com exemplo oficial.
- [Airbnb Engineering: Avoiding Double Payments in a Distributed Payments System](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb): idempotência em produção.
- [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests): o contrato de `Idempotency-Key` que virou padrão.
