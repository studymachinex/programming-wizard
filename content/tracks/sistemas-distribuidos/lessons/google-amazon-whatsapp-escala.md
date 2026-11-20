> **Em uma frase:** Google resolve busca com índice invertido e consenso; Amazon, com células e idempotência; WhatsApp, com Erlang e conexões persistentes — três problemas, três arquiteturas.

Comparar gigantes revela que não existe arquitetura universal. O que existe é adequação ao padrão de acesso: ler tudo, comprar sem duplicar, entregar mensagem em tempo real. Entender o porquê vale mais que memorizar o diagrama.

## O problema

Como indexar a web e responder em milissegundos? Como processar um checkout que não pode cobrar duas vezes? Como manter 2 bilhões de usuários conectados com mensagens confiáveis? Cada um impõe restrições diferentes de consistência, latência e custo.

## Como funciona

**Google Search:** rastreamento, indexação e serving. Índice invertido shardado, replicado e cacheado; ranking com sinais; infraestrutura com consenso (Chubby/Spanner) para metadados. A busca tolera índice levemente desatualizado, mas não pode ficar fora.

**Amazon:** células (shards isolados) para limitar blast radius; idempotência em pagamentos; outbox e saga no checkout; DynamoDB com quórum configurável. A compra exige consistência no pedido, não no catálogo inteiro.

**WhatsApp:** Erlang/OTP para milhões de conexões por servidor, filas por usuário, entrega com ACK e retry. A consistência é por conversa; não há necessidade de ordem global.

| Sistema | Dados quentes | Consistência | Gargalo |
|---|---|---|---|
| Google | Índice invertido | Eventual no índice | Fan-out de consulta |
| Amazon | Pedido/carrinho | Forte por agregado | Coordenação de pagamento |
| WhatsApp | Sessão/conversa | Por conversa | Conexões e entrega |

## Na prática

Use os casos para calibrar decisões: se o requisito é "nunca cobrar duas vezes", idempotência e constraint única vencem fila bonita. Se é "entregar mensagem", ACK e retry com dedup. Se é "buscar", índice invertido e cache.

Escala menor: cache CDN para leitura, célula por tenant, outbox para eventos, fila por usuário. Meça o gargalo antes de distribuir. A maior parte dos sistemas não precisa de consenso global.

## Armadilhas comuns

- Shardar antes de ter gargalo medido.
- Consistência forte onde eventual bastaria (e vice-versa).
- Ignorar idempotência em retries.
- Arquitetura de célula sem roteamento claro.
- Copiar "web scale" e multiplicar custo operacional.

## Checklist de domínio

- [ ] Explico índice invertido e sharding de busca.
- [ ] Entendo células e blast radius.
- [ ] Sei onde idempotência é obrigatória.
- [ ] Entendo entrega de mensagem com ACK.
- [ ] Escolho consistência por requisito.

## Para ir além

Leia os papers e blogs de engenharia do Google, Amazon e WhatsApp. Depois escreva um parágrafo de "o que eu aplicaria no meu sistema e por quê" para cada caso.
