> **Em uma frase:** chat em escala é um problema de conexões persistentes, ordenação por conversa e entrega com ACK — não de REST.

O design clássico de WhatsApp: bilhões de conexões, mensagens em tempo real, histórico e presença. A arquitetura gira em torno de sessões, filas por usuário e armazenamento append-only. Consistência é por conversa, não global.

## Requisitos

- 1 bilhão de usuários, 100 milhões online.
- Mensagem entregue em < 500 ms no p99.
- Histórico persistente e sincronização multi-dispositivo.
- Ordem por conversa; sem ordem global.
- Tolerância a offline e reconexão.

## Capacity estimation

100M conexões simultâneas. Se cada servidor mantém 1M conexões (com epoll/Erlang), são 100 servidores, com margem para 3x. Cada mensagem ~200 bytes; 50 mil msg/s = 10 MB/s. Armazenamento: 50 mil × 86.400 × 200 B ≈ 864 GB/dia; retenção e compactação mudam a conta.

## API

```text
POST /mensagens        {conversaId, destino, texto, clientMsgId}
GET  /conversas/{id}/mensagens?antes={cursor}
WS   /socket           auth + eventos: mensagem, ack, presenca
```

## Arquitetura

```text
Cliente --WS--> Gateway de sessão --> Roteador de presença
                                  --> Fila por usuário (Kafka/Redis)
                                  --> Serviço de mensagens --> Cassandra/Scylla
                                  --> Serviço de histórico --> cache
```

1. Cliente envia com `clientMsgId` (idempotência).
2. Gateway autentica e publica na partição da conversa.
3. Serviço ordena por `(conversaId, sequencia)` e persiste.
4. Roteador encontra sessão do destinatário e entrega.
5. Destinatário responde ACK; sem ACK, retry com backoff.
6. Offline: push notification e sincronização ao reconectar.

## Decisões e trade-offs

- **Ordem por conversa:** partição por `conversaId`; não precisa de consenso global.
- **Armazenamento:** wide-column (Cassandra) para escrita alta e consulta por partição; cache para mensagens recentes.
- **Multi-dispositivo:** cada dispositivo tem cursor próprio; mensagens são fan-out para dispositivos.
- **Presença:** efêmera, em Redis com TTL; não é fonte de verdade.
- **E2E encryption:** chaves por dispositivo; servidor não lê conteúdo, mas ainda roteia.

## Gargalos

Conexões (file descriptors, memória), fan-out para grupos grandes, sincronização de histórico e picos de reconexão. Grupos de 1.000 membros exigem fan-out assíncrono e limites.

## Checklist de resposta

- [ ] Requisitos e números.
- [ ] Modelo de dados e ordem por conversa.
- [ ] Entrega, ACK e offline.
- [ ] Multi-dispositivo.
- [ ] Gargalos e trade-offs.

## Para ir além

Leia o artigo de engenharia do WhatsApp sobre Erlang e o design de chat do System Design Primer. Depois desenhe a sincronização de dois dispositivos offline.
