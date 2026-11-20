> **Em uma frase:** thread de plataforma é um recurso caro; quando ela bloqueia, o trabalho que só ela poderia fazer para — e no event loop isso significa parar milhares de conexões de uma vez.

Threads não são gratuitas: cada uma reserva stack, participa do escalonador e provoca troca de contexto. Em um pool pequeno, uma chamada lenta consome uma vaga até terminar. Em um event loop, ela consome a única vaga que atende muitas conexões. Entender essa diferença é o que separa “está lento” de “o serviço inteiro caiu”.

## O problema

Um endpoint Quarkus retorna `Uni<Pedido>` e, dentro dele, consulta o PostgreSQL com JDBC. Como o tipo de retorno é reativo, o Quarkus executa o método no event loop. O `Uni` só é assinado nessa mesma thread, e o `dataSource.getConnection()` bloqueia até o banco responder. Enquanto isso, nenhuma outra requisição atendida por aquele event loop avança: nem as que só devolveriam um JSON em cache.

O sintoma clássico é latência de todas as rotas subir junto, seguidas de timeout no proxy e de um aviso no log sobre thread bloqueada. Adicionar threads ao pool ou aumentar o timeout não corrige a causa; só compra alguns segundos.

## Como funciona

Uma thread de plataforma é uma thread do sistema operacional com stack própria (tipicamente 1 MB). Criar, manter e alternar entre milhares delas custa memória e CPU. Por isso usamos pools: um conjunto fixo de threads reutilizadas atende uma fila de tarefas. O tamanho ideal depende do tipo de trabalho:

- **CPU-bound:** o tempo é gasto calculando. Mais threads que núcleos só aumentam a troca de contexto. Use algo próximo do número de núcleos.
- **I/O-bound:** o tempo é gasto esperando rede, disco ou banco. A thread fica ociosa, mas ocupada. A Lei de Little ajuda: `concorrência ≈ throughput × latência`. Para 500 req/s com 200 ms de latência, são ~100 tarefas simultâneas.

O event loop do Vert.x, que sustenta o Quarkus, usa poucas threads — por padrão, uma por núcleo. Cada thread roda um loop que drena eventos de muitas conexões e nunca deve esperar. A regra é simples: se o código pode demorar, ele não pertence ao event loop. O Quarkus ainda instala um detector que avisa quando um event loop fica bloqueado além de `quarkus.vertx.max-event-loop-execute-time` (2 segundos por padrão).

Métodos REST que retornam `Uni`, `Multi`, `CompletionStage` ou `Publisher` são tratados como não bloqueantes e rodam no event loop. Métodos com retorno direto rodam na worker pool. É por isso que o exemplo abaixo é perigoso mesmo parecendo reativo:

```java
package br.com.loja.pedidos;

import io.smallrye.mutiny.Uni;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import javax.sql.DataSource;
import java.sql.SQLException;

@Path("/pedidos")
public class PedidoResource {

    @Inject
    DataSource dataSource;

    @GET
    @Path("/{id}")
    public Uni<Pedido> buscar(@PathParam("id") long id) {
        // O fornecedor roda na thread que assina o Uni: o event loop.
        return Uni.createFrom().item(() -> consultar(id));
    }

    private Pedido consultar(long id) {
        try (var conn = dataSource.getConnection();
             var stmt = conn.prepareStatement(
                 "select id, cliente_id, total from pedido where id = ?")) {
            stmt.setLong(1, id);
            try (var rs = stmt.executeQuery()) {
                return rs.next()
                    ? new Pedido(rs.getLong("id"),
                                 rs.getLong("cliente_id"),
                                 rs.getBigDecimal("total"))
                    : null;
            }
        } catch (SQLException e) {
            throw new IllegalStateException("falha ao buscar pedido " + id, e);
        }
    }
}
```

A versão correta devolve um tipo não reativo e deixa o Quarkus despachar para uma worker thread. Se o volume de I/O bloqueante for alto, `@RunOnVirtualThread` troca a worker por uma virtual thread por requisição:

```java
import io.smallrye.common.annotation.Blocking;
import io.smallrye.common.annotation.RunOnVirtualThread;

@GET
@Path("/{id}")
@Blocking
public Pedido buscar(@PathParam("id") long id) {
    return consultar(id); // worker pool, fora do event loop
}

@GET
@Path("/{id}/virtual")
@RunOnVirtualThread
public Pedido buscarComVirtualThread(@PathParam("id") long id) {
    return consultar(id); // uma virtual thread por requisição
}
```

`@Blocking` e `@NonBlocking` sobrescrevem a heurística do Quarkus. Use `@NonBlocking` quando a assinatura sugere bloqueio mas o corpo não bloqueia; use `@Blocking` sempre que houver JDBC, arquivo, criptografia pesada ou SDK síncrono. O tipo de retorno não torna o código reativo: quem bloqueia é a chamada, não o `Uni`.

## Na prática

Escolha o modelo pelo trabalho, não pela moda:

| Modelo | Custo por tarefa | Pode bloquear? | Indicado para |
|---|---|---|---|
| Thread de plataforma em pool | Stack + troca de contexto | Sim, mas ocupa a vaga | I/O bloqueante com concorrência limitada |
| Event loop (Netty/Vert.x) | Muito baixo | Não | Muitas conexões e I/O não bloqueante |
| Worker thread do Quarkus | Thread do pool | Sim | JDBC, arquivos, SDKs síncronos |
| Virtual thread | Alguns KB, sob demanda | Sim, desmonta da carrier | I/O bloqueante em massa |

Meça antes de dimensionar. Exponha threads ativas, tamanho da fila, tempo de espera e p99 por dependência. Se a fila cresce e o p99 sobe, o problema é capacidade ou bloqueio — não falta de timeout. Para I/O bloqueante, limite a concorrência com um `Semaphore`; para CPU, limite pelo número de núcleos.

## Armadilhas comuns

- Colocar JDBC dentro de `Uni.createFrom().item(...)` e achar que o `Uni` o tornou assíncrono.
- Usar `@Blocking` em tudo: a worker pool vira o novo gargalo e o event loop fica ocioso.
- Configurar `quarkus.vertx.max-event-loop-execute-time` para esconder o aviso em vez de corrigir a chamada.
- Dimensionar pool por “quantidade de requisições” sem considerar latência e tempo de espera.
- Misturar tarefas rápidas de CPU com chamadas de 30 segundos no mesmo pool.
- Ignorar o log do detector de bloqueio achando que é ruído.

## Checklist de domínio

- [ ] Sei dizer se uma tarefa é CPU-bound ou I/O-bound pelo que ela faz, não pelo nome.
- [ ] Explico por que uma chamada JDBC no event loop afeta conexões não relacionadas.
- [ ] Sei quando o Quarkus usa event loop, worker ou virtual thread.
- [ ] Uso `@Blocking`, `@NonBlocking` e `@RunOnVirtualThread` com critério.
- [ ] Consigo estimar concorrência com a Lei de Little e validar com métricas.

## Para ir além

Leia o modelo de execução do Quarkus REST e o guia de arquitetura reativa para entender onde cada thread entra. Depois reproduza o incidente: suba um endpoint com JDBC no event loop, aplique carga e observe a latência das outras rotas. Corrija com `@Blocking` e compare.

- [Quarkus REST — execution model](https://quarkus.io/guides/rest#execution-model-blocking-non-blocking)
- [Quarkus — arquitetura reativa](https://quarkus.io/guides/quarkus-reactive-architecture)
- [Java 21 — ThreadPoolExecutor](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
