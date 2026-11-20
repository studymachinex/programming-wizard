> **Em uma frase:** evento conta o que aconteceu; comando pede o que deve acontecer — misturar os dois acopla produtor e consumidor e transforma o broker em RPC.

Um evento é um fato imutável no passado: `PedidoCriado`. Um comando é uma intenção: `CriarPedido`. A diferença parece semântica, mas define acoplamento, versionamento e quem é dono da regra.

## O problema

Um serviço publica `AtualizarEstoque` e espera que outro execute. Se o consumidor muda a regra, o produtor precisa saber. Se dois consumidores leem o mesmo comando, ambos podem executar. Já um evento permite que cada consumidor reaja como quiser, sem o produtor conhecer os interessados.

## Como funciona

| | Evento | Comando |
|---|---|---|
| Tempo | Passado | Imperativo |
| Dono da regra | Consumidor | Produtor |
| Consumidores | Muitos | Um (idealmente) |
| Nome | `PedidoCriado` | `CriarPedido` |
| Rejeição | Não se rejeita o passado | Pode falhar |

Contratos devem ser explícitos: nome, versão, chave, schema e semântica. Use um schema registry e compatibilidade backward.

```java
record PedidoCriado(
    String pedidoId,
    String clienteId,
    BigDecimal total,
    Instant ocorridoEm,
    int versao
) {}
```

O evento não deve carregar a entidade inteira se ninguém precisa; carregue o suficiente para o consumidor agir ou buscar detalhes.

## Na prática

Nomeie eventos no passado e comandos no imperativo. Um comando deve ter um consumidor claro; se vários precisam reagir, publique um evento.

Versionamento: adicione campos opcionais com default; nunca reutilize um campo com outro significado. Consumidores antigos devem ignorar campos novos. Para breaking change, publique `PedidoCriadoV2` e mantenha os dois por um período.

Idempotência: todo consumidor precisa de chave de negócio e dedup. O broker entrega at-least-once; a semântica é sua.

## Armadilhas comuns

- Evento com nome de comando (`AtualizarPedido`).
- Evento genérico (`DadosAtualizados`) sem contrato.
- Payload com entidade JPA e campos internos.
- Consumidor que chama de volta o produtor (ciclo).
- Breaking change sem versão.

## Checklist de domínio

- [ ] Distingo evento e comando pelo contrato.
- [ ] Nomeio e versiono schemas.
- [ ] Mantenho eventos imutáveis.
- [ ] Garanto idempotência no consumidor.
- [ ] Evito RPC disfarçado de evento.

## Para ir além

Leia o capítulo de event-driven architecture do microservices.io e a documentação de schema evolution do Schema Registry. Depois revise os tópicos do seu projeto e renomeie o que for comando.
