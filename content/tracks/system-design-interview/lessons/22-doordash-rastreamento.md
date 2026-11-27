> **Em uma frase:** rastrear entregas em tempo real é um problema de ingestão de alta frequência com fan-out seletivo: muita escrita de localização, pouca leitura útil, e só para quem está olhando.

O problema: milhões de pedidos ativos no jantar de sexta. Cada entregador manda a posição a cada 4 segundos, e cada cliente quer ver o pontinho andando no mapa e um ETA que não pule de 12 para 25 minutos. O restaurante quer saber quando o entregador está chegando para soltar o pedido.

## Requisitos

- Entregador envia localização a cada ~4 s enquanto está em entrega.
- Cliente vê posição e ETA atualizados enquanto a tela do pedido estiver aberta.
- Restaurante recebe aviso de "entregador a 2 minutos".
- Histórico de trajeto para suporte e disputas (cliente diz que não recebeu).
- Escala de referência: 500 mil entregadores ativos no pico e 2 milhões de pedidos em andamento.
- Atualização visível em < 2 s. Perder um ponto isolado é aceitável, mas mostrar um ponto velho como novo não é.

## Capacity estimation

Escrita: 500k entregadores / 4 s = **125 mil updates/s**. Cada update tem ~100 bytes (ids, lat, lng, velocidade, timestamp, sequência), o que dá ~12 MB/s de entrada.

Leitura: dos 2M pedidos, talvez 20% estejam com a tela aberta a cada momento, ou seja, 400k conexões. Se cada uma recebe um update a cada 4 s, são **100 mil mensagens/s de saída**. O ponto importante: **80% das escritas não têm ninguém olhando**, então não faça fan-out de tudo para todo mundo.

Histórico: 125k/s × 86.400 s × 100 B ≈ 1 TB/dia. Isso vai para armazenamento barato, particionado por entregador e dia.

## API

```text
POST /localizacao   {entregadorId, lat, lng, seq, capturadoEm}       (ou stream gRPC/MQTT)
GET  /pedidos/{id}/rastreamento  -> upgrade para WebSocket/SSE
     eventos: {tipo: "posicao", lat, lng, etaSegundos} | {tipo: "status", valor: "RETIRADO"}
```

## Arquitetura

```text
App entregador -> gateway de ingestão -> Kafka "localizacoes" (partição por entregadorId)
                                          |-> consumidor "ultima posição" -> Redis (TTL 60 s)
                                          |-> consumidor "histórico"      -> Cassandra/S3 (entregador, dia)
                                          |-> consumidor "fan-out"        -> só pedidos com assinantes
App cliente   -> serviço de push (WebSocket/SSE) <- assinaturas pedido -> nó de conexão
Serviço de ETA <- posição + rota + histórico de tempos por região
```

## Decisões e trade-offs

**Particionar o Kafka por entregador** preserva a ordem dos pontos de cada entregador, que é a única ordem que importa.

**Pontos fora de ordem.** Rede móvel reentrega pacotes atrasados. Cada ponto traz um número de sequência gerado no celular, e quem grava a última posição descarta o que for mais antigo que o atual. Sem isso, o pontinho "volta" no mapa.

```java
import java.util.concurrent.ConcurrentHashMap;

class UltimaPosicao {
    record Ponto(long entregadorId, double lat, double lng, long seq, long capturadoEm) {}

    private final ConcurrentHashMap<Long, Ponto> atual = new ConcurrentHashMap<>();

    /** Aplica o ponto só se for mais novo. Devolve true se a posição visível mudou. */
    boolean aplicar(Ponto p) {
        boolean[] mudou = {false};
        atual.compute(p.entregadorId(), (id, anterior) -> {
            if (anterior != null && anterior.seq() >= p.seq()) return anterior; // atrasado ou duplicado
            mudou[0] = true;
            return p;
        });
        return mudou[0];
    }
}
```

No Redis, a mesma regra fica num script Lua (compara `seq` e grava), para ser atômica entre várias instâncias consumidoras.

**Fan-out seletivo.** Quando o cliente abre a tela, o serviço de push registra `pedido -> nó de conexão` (Redis com TTL renovado por heartbeat) e `entregador -> pedidos assinados`. O consumidor de fan-out só publica para entregadores que têm pedido assinado. Um entregador com dois pedidos (batching) notifica os dois clientes.

**WebSocket ou SSE?** O tráfego é quase só servidor para cliente, então SSE basta, é mais simples atrás de proxies e reconecta sozinho. WebSocket vale se o cliente também envia mensagens (chat com o entregador). Polling a cada 4 s com 400k clientes é 100k req/s de HTTP completo, o que funciona, mas desperdiça.

```java
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

class FanOut {
    private final Map<Long, Set<Long>> pedidosPorEntregador = new ConcurrentHashMap<>();
    private final Map<Long, Consumer<String>> conexaoPorPedido = new ConcurrentHashMap<>();

    void assinar(long pedidoId, long entregadorId, Consumer<String> conexao) {
        pedidosPorEntregador.computeIfAbsent(entregadorId, k -> ConcurrentHashMap.newKeySet()).add(pedidoId);
        conexaoPorPedido.put(pedidoId, conexao);
    }

    void cancelar(long pedidoId, long entregadorId) {
        conexaoPorPedido.remove(pedidoId);
        Set<Long> pedidos = pedidosPorEntregador.get(entregadorId);
        if (pedidos != null) pedidos.remove(pedidoId);
    }

    /** Chamado pelo consumidor do Kafka. Sem assinantes, custa uma consulta ao mapa e nada mais. */
    void publicar(long entregadorId, double lat, double lng, int etaSegundos) {
        for (long pedidoId : pedidosPorEntregador.getOrDefault(entregadorId, Set.of())) {
            Consumer<String> c = conexaoPorPedido.get(pedidoId);
            if (c != null) c.accept("{\"lat\":" + lat + ",\"lng\":" + lng + ",\"eta\":" + etaSegundos + "}");
        }
    }
}
```

**ETA estável.** Recalcular a rota a cada ponto faz o ETA oscilar e custa caro. Recalcule a cada 30 s ou quando o entregador sair da rota prevista, suavize (média móvel) e mostre ao cliente uma faixa ("12–15 min"). O aviso ao restaurante usa geofence: entrar num raio de ~500 m dispara o evento uma vez só.

**Bateria e dados do entregador.** Mandar posição a cada 4 s com GPS de alta precisão drena a bateria. O app manda com menos frequência quando está parado ou longe do destino e com mais frequência na chegada. É um detalhe de produto que vale citar.

## Gargalos

- **Picos de horário:** o jantar concentra 3–4x a média. Kafka absorve, e os consumidores escalam por partição.
- **Nós de push com conexões longas:** escale por número de conexões (~50–100k por nó), e não por CPU. Reconexão em massa após deploy derruba o serviço, então use jitter no reconnect.
- **Hot partition:** improvável por entregador. Se particionar por região, o centro da cidade vira hotspot.

## Checklist de resposta

- [ ] Calculei escrita (125k/s) e mostrei que a maior parte não tem leitor.
- [ ] Separei última posição (Redis), histórico (armazenamento frio) e fan-out.
- [ ] Tratei pontos fora de ordem com número de sequência.
- [ ] Justifiquei SSE ou WebSocket e o fan-out seletivo por assinatura.
- [ ] Mostrei como deixar o ETA estável.

## Para ir além

- [DoorDash Engineering Blog](https://careersatdoordash.com/engineering-blog/): artigos sobre ETA, dispatch e a plataforma de tempo real.
- [MDN: Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events): o protocolo de push mais simples para o navegador.
- [Redis: Geospatial indexes](https://redis.io/docs/latest/develop/data-types/geospatial/): GEOADD e GEOSEARCH para "entregadores perto do restaurante".
