> **Em uma frase:** Netflix e Uber não venceram por usar mais tecnologias — venceram por escolher poucas abstrações e operá-las com obsessão.

Estudar arquiteturas em escala serve para reconhecer padrões, não para copiar diagramas. Netflix e Uber enfrentaram problemas específicos: streaming global e matching urbano em tempo real. As soluções revelam trade-offs que você pode aplicar em escala menor.

## O problema

Como servir vídeo para milhões de dispositivos sem construir uma CDN própria? Como casar motorista e passageiro em segundos, com geografia e oferta dinâmica? Como manter tudo funcionando quando uma região cai? Cada resposta envolve consistência, custo e latência.

## Como funciona

**Netflix:** Open Connect (CDN própria) coloca conteúdo perto do usuário; a nuvem controla catálogo, recomendações e encoding. Microserviços com fallback e circuit breakers; Chaos Monkey testa resiliência. Dados de visualização alimentam recomendações, mas o streaming não depende deles.

**Uber:** matching geográfico com células (H3/geohash), filas e serviços de oferta. Kafka para eventos, schemaless/dispatch em memória, e consistência eventual entre viagem, pagamento e preço. Picos de Ano Novo exigiram sharding e isolamento por região.

| Problema | Netflix | Uber |
|---|---|---|
| Latência crítica | Início do vídeo | Matching em segundos |
| Dados quentes | Catálogo/CDN | Localização e oferta |
| Consistência | Eventual em recomendações | Forte por viagem, eventual no ecossistema |
| Resiliência | Chaos engineering | Isolamento celular |

## Na prática

Extraia princípios: CDN para conteúdo estático, cache para leitura quente, filas para desacoplar picos, idempotência para retries, observabilidade para detectar degradação. Aplique um por vez, medindo.

Não copie a escala: um time pequeno não precisa de 500 microserviços. Monolito modular com boas fronteiras e deploy frequente resolve mais que arquitetura de palco. A complexidade operacional é proporcional ao número de peças móveis.

## Armadilhas comuns

- Copiar stack sem copiar o problema.
- Microserviços antes de product-market fit.
- Ignorar custo de egress e CDN.
- Achar que consistência eventual é gratuita.
- Chaos engineering sem observabilidade básica.

## Checklist de domínio

- [ ] Explico o papel da CDN no Netflix.
- [ ] Entendo matching geográfico e células no Uber.
- [ ] Sei quais dados exigem consistência forte.
- [ ] Reconheço padrões reutilizáveis em escala menor.
- [ ] Evito copiar complexidade sem necessidade.

## Para ir além

Leia os blogs de engenharia da Netflix e do Uber sobre Open Connect, chaos engineering e matching. Depois mapeie um padrão que você pode aplicar no seu projeto.
