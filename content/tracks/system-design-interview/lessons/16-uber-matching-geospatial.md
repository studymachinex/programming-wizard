> **Em uma frase:** matching do Uber é um índice geoespacial em memória, atualizado por streaming, com consistência por viagem — não um JOIN de banco.

O problema: dado um passageiro em (lat, lng), encontrar motoristas próximos disponíveis e escolher um, em segundos, com picos de tráfego. Geohash/H3, células e filas por região resolvem.

## Requisitos

- 10M motoristas, 1M viagens/hora no pico.
- Matching < 2 s p99.
- Localização atualizada a cada 4 s.
- Consistência por viagem; sem duplicar motorista.
- Tolerância a região indisponível.

## Capacity estimation

1M motoristas online × 1 update/4 s = 250k updates/s. Cada update ~100 B = 25 MB/s. Índice em memória: 1M × ~200 B = 200 MB por região lógica; replicado.

## API

```text
POST /localizacao {motoristaId, lat, lng, status}
POST /viagens     {passageiroId, origem, destino}
GET  /viagens/{id}
```

## Arquitetura

```text
App motorista --> ingestão --> Kafka (partição por região)
                         --> índice geoespacial em memória (H3)
                         --> serviço de matching
App passageiro --> matching --> candidatos --> oferta --> aceite
                         --> máquina de estados da viagem
                         --> ledger/pagamento
```

## Decisões e trade-offs

- **H3/geohash:** células de tamanho fixo; busca vizinhança com k-ring.
- **Índice em memória:** leitura rápida; reconstruível a partir do stream.
- **Consistência:** aceite da viagem usa lock/compare-and-set por motorista; sem dois passageiros.
- **Particionamento por região:** isola hotspots e falhas; fronteiras exigem busca vizinha.
- **Preço dinâmico:** cálculo por oferta/demanda, com regras e limites.
- **Falha:** se a região cai, degradar para regiões vizinhas ou fila.

## Gargalos

Hotspots (aeroporto, evento), atualização de localização, matching concorrente e picos. Mitigações: células adaptativas, cache, throttling e filas por região.

## Variação: Uber Eats

"Design Uber Eats" é a mesma entrevista com três partes a mais: o restaurante entra no meio do fluxo, o matching tem duas pontas e o preço dinâmico vira assunto central.

**Busca de restaurantes por geohash.** O cliente quer restaurantes que entreguem no endereço dele. Pré-calcule para cada restaurante o conjunto de células H3 (resolução ~8, hexágonos de ~0,7 km²) da área de entrega e indexe `célula -> restaurantes`. A busca converte o endereço em célula e faz uma leitura. Geohash funciona igual, mas tem células retangulares de tamanhos desiguais conforme a latitude e vizinhos menos uniformes. O H3 dá distância constante entre vizinhos, o que facilita os anéis de busca.

**Matching com tempo de preparo.** No Eats, despachar o entregador assim que o pedido entra faz ele esperar 15 minutos no balcão. O dispatch precisa casar a **chegada do entregador** com o **fim do preparo**: o serviço estima o tempo de preparo por restaurante e por horário, e só oferece a corrida quando `tempo_de_preparo_restante ≈ tempo_de_deslocamento`. Agrupar dois pedidos do mesmo restaurante ou de restaurantes vizinhos (batching) reduz custo, mas só se o atraso extra ficar abaixo de um limite.

**Surge pricing.** Calculado por célula a cada 1–2 minutos: a razão entre demanda (pedidos abertos) e oferta (entregadores livres na célula e nos vizinhos) vira um multiplicador, com teto e suavização para não oscilar. O preço mostrado na cotação é **congelado** com validade curta, para o cliente pagar o que viu, mesmo que o multiplicador mude um segundo depois.

```java
import java.util.Map;

class SurgePorCelula {
    private static final double TETO = 2.5;
    private static final double SUAVIZACAO = 0.3; // peso do valor novo (média móvel exponencial)

    private final Map<String, Double> multiplicadorAtual;

    SurgePorCelula(Map<String, Double> multiplicadorAtual) { this.multiplicadorAtual = multiplicadorAtual; }

    double recalcular(String celula, int pedidosAbertos, int entregadoresLivres) {
        double razao = (double) pedidosAbertos / Math.max(1, entregadoresLivres);
        double alvo = Math.min(TETO, Math.max(1.0, razao));            // nunca abaixo de 1x nem acima do teto
        double anterior = multiplicadorAtual.getOrDefault(celula, 1.0);
        double novo = anterior + SUAVIZACAO * (alvo - anterior);        // evita saltos de 1x para 2,5x
        multiplicadorAtual.put(celula, novo);
        return novo;
    }
}
```

**SQL vs NoSQL.** Não é uma escolha única, é uma por tipo de dado:

| Dado | Escolha | Por quê |
|---|---|---|
| Pedidos, pagamentos | SQL (Postgres/MySQL particionado) | Transação, máquina de estados, auditoria |
| Cardápios | Documento (MongoDB/DynamoDB) + cache | Leitura massiva, esquema que varia por restaurante |
| Localização ao vivo | Redis/memória | Escrita de alta frequência, só o último valor importa |
| Histórico de trajetos | Cassandra/S3 | Append-only, volume alto, leitura rara |

A frase que o entrevistador quer ouvir: "o pedido precisa de consistência forte e transação; o cardápio e a localização, não".

## Checklist de resposta

- [ ] Requisitos e números.
- [ ] Índice geoespacial e atualização.
- [ ] Matching e concorrência.
- [ ] Particionamento e falha.
- [ ] Preço e consistência.
- [ ] Para o Eats: busca por célula, dispatch alinhado ao preparo, surge suavizado e escolha de banco por tipo de dado.

## Para ir além

- [H3: documentação oficial](https://h3geo.org/docs/): resoluções, k-ring e por que hexágonos.
- Simule 1M pontos e compare geohash vs H3 em número de células vizinhas consultadas por busca.
