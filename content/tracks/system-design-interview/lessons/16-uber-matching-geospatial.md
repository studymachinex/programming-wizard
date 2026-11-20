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

## Checklist de resposta

- [ ] Requisitos e números.
- [ ] Índice geoespacial e atualização.
- [ ] Matching e concorrência.
- [ ] Particionamento e falha.
- [ ] Preço e consistência.

## Para ir além

Leia o artigo de engenharia do Uber sobre H3 e matching. Depois simule 1M pontos e compare geohash vs H3.
