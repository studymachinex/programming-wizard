> **Em uma frase:** o entrevistador não avalia se você decorou Kafka ou Cassandra, mas se consegue partir de um problema ambíguo, fechar escopo, dimensionar e defender decisões em 45 minutos.

## O problema

Duas pessoas recebem o mesmo enunciado: "desenhe o Twitter". A primeira começa a desenhar quinze caixas, cita Kafka, Redis, Cassandra e um data lake. Aos 35 minutos, ainda não disse quantos usuários existem, quanto storage precisa ou por que escolheu cada peça. A segunda pergunta quem usa, quantas vezes por dia, o que precisa aparecer no feed e qual latência aceitável. Aos 10 minutos, tem um escopo pequeno e números. Aos 30, já discutiu fanout, cache e o problema das celebridades. A segunda passa.

System design não é prova de vocabulário. É uma simulação de como você trabalha: reduzir ambiguidade, priorizar, estimar, escolher sob incerteza e comunicar. O tempo é curto de propósito. O entrevistador quer ver o que você faz quando não dá para explorar tudo.

O erro fatal é tratar a entrevista como uma apresentação de arquitetura. Você não está vendendo um diagrama; está demonstrando julgamento. Um desenho simples com decisões justificadas vale mais que um diagrama impressionante sem números.

## Como funciona

O roteiro abaixo é o mais usado em big techs. Ele não é uma camisa de força, mas impede que você chegue aos 40 minutos sem ter falado de falha, escala ou trade-off.

| Fase | Tempo | Entregável | Sinal avaliado |
|---|---|---|---|
| Requisitos | 5–7 min | 3–5 funcionais, 2–3 não-funcionais, fora de escopo | Comunicação e priorização |
| Alto nível | 8 min | Fluxo ponta a ponta com setas rotuladas | Visão sistêmica |
| Deep dives | 15 min | 2–3 componentes críticos com números | Profundidade técnica |
| Escala e falha | 8 min | Sharding, réplica, hot key, degradação | Senioridade |
| Fechamento | 5 min | Riscos, trade-offs, métricas, próximo passo | Autocrítica e clareza |

**1. Requisitos (5–7 min).** Não faça um interrogatório. Escolha as perguntas que mudam a arquitetura: quem são os usuários, qual o volume, leitura ou escrita predominante, qual a latência, qual a consistência necessária, qual o custo aceitável. Se o entrevistador não souber, proponha um número e siga: "vou assumir 100 milhões de DAU e 20 leituras por usuário/dia; se for muito diferente, ajusto". Suposição declarada é melhor que silêncio.

**2. Alto nível (8 min).** Desenhe o caminho completo: cliente, DNS, CDN, load balancer, API gateway, serviços, storage, filas. Rotule cada seta com protocolo e modo: HTTP síncrono, WebSocket, evento assíncrono. Não entre em detalhes ainda. O objetivo é ter um mapa que todos possam seguir.

**3. Deep dives (15 min).** Escolha dois ou três pontos que decidem o problema. Em um encurtador de URL, são a geração do código, o caminho de redirect e o storage. Em um feed, são o fanout e o ranking. Diga por que está aprofundando: "o gargalo aqui é a escrita de localização, então vou detalhar a indexação geospatial". Não tente detalhar tudo; profundidade rasa em dez componentes é pior que profundidade real em três.

**4. Escala e falha (8 min).** Volte aos números. O que acontece quando o tráfego triplica? O que quebra primeiro? Como você particiona? O que acontece se o cache cair, se a réplica atrasar, se o provedor de pagamento timeout? Tenha uma resposta curta para cada: degradar, enfileirar, recusar, reconciliar. O entrevistador muitas vezes injeta falhas para testar se você mantém a calma e não redesenha o sistema inteiro.

**5. Fechamento (5 min).** Resuma as três decisões principais, o custo de cada uma e o que você monitoraria. "Escolhi Postgres com réplica porque o acesso é por chave e o volume cabe; pago com lag de leitura e trato com leitura no primário após escrita. Se passássemos de 50 mil escritas/s, reavaliaria sharding." Isso mostra que você sabe onde a arquitetura quebra.

Um cronômetro mental ajuda. Se você tem 45 minutos, cada fase tem um dono. Não roube 10 minutos dos deep dives para explicar requisitos que ninguém pediu.

```java
import java.util.List;

public class InterviewClock {

    public record Phase(String name, int minutes, String deliverable) {}

    public static List<Phase> plan() {
        return List.of(
            new Phase("Requisitos", 6, "funcionais, não-funcionais e fora de escopo"),
            new Phase("Alto nível", 8, "fluxo ponta a ponta com setas rotuladas"),
            new Phase("Deep dives", 15, "2 ou 3 gargalos com números"),
            new Phase("Escala e falha", 8, "particionamento, réplicas e degradação"),
            new Phase("Fechamento", 8, "trade-offs, riscos e métricas")
        );
    }

    public static void main(String[] args) {
        int elapsed = 0;
        for (Phase phase : plan()) {
            elapsed += phase.minutes();
            System.out.printf("%02d-%02d min | %-16s | %s%n",
                elapsed - phase.minutes(), elapsed, phase.name(), phase.deliverable());
        }
        System.out.println("Total: " + elapsed + " minutos");
    }
}
```

Um segundo hábito: escreva a API cedo. A API força você a decidir o que o sistema faz e quais dados entram e saem. Ela também dá ao entrevistador algo concreto para criticar, o que gera conversa produtiva em vez de silêncio.

```java
import java.util.List;

public class ApiSketch {

    public record Endpoint(String method, String path, String request, String response, int p99Ms) {}

    public static List<Endpoint> urlShortener() {
        return List.of(
            new Endpoint("POST", "/v1/urls", "longUrl, customAlias?", "code, shortUrl, expiresAt", 150),
            new Endpoint("GET", "/{code}", "code", "302 Location", 30),
            new Endpoint("DELETE", "/v1/urls/{code}", "code", "204 No Content", 100)
        );
    }

    public static void main(String[] args) {
        urlShortener().forEach(e ->
            System.out.printf("%-6s %-18s p99=%dms%n", e.method(), e.path(), e.p99Ms()));
    }
}
```

## Na prática

Suponha que o enunciado seja "desenhe um encurtador de URL". Nos primeiros oito minutos, uma condução forte soa assim:

- "Quem cria links? Usuários anônimos ou autenticados? Vou assumir ambos, com limite por conta."
- "Volume: 100 milhões de URLs novas por dia, leitura dez vezes maior. Isso dá cerca de 1.200 escritas/s na média e 5.000 no pico; leituras de 12.000/s na média e 50.000 no pico."
- "Cada URL tem 500 bytes de metadados. São 50 GB/dia, 18 TB/ano; com réplica e índice, 50 TB/ano."
- "Preciso de redirect em menos de 50 ms p99. O caminho crítico é cache + KV; analytics não pode bloquear."
- "Fora de escopo: interface, detecção de malware, cobrança."

Com isso, o desenho de alto nível quase se escreve sozinho. O entrevistador já sabe que você pensa em números e que o sistema tem um caminho crítico separado do resto. A partir daí, os deep dives são escolha, não desespero.

## Armadilhas comuns

- **Transformar requisitos em interrogatório.** Pergunte o que muda a arquitetura. Cinco perguntas boas valem mais que vinte irrelevantes.
- **Começar pela tecnologia.** "Vou usar Kafka" antes de saber se existe necessidade de assincronismo é sinal de solução procurando problema.
- **Falar "muito tráfego" sem número.** Sem QPS, storage e latência, não há decisão técnica; há adjetivo.
- **Ignorar as dicas do entrevistador.** "E se o cache cair?" é um convite para um deep dive. "Como você garante que dois usuários não peguem o mesmo motorista?" é outro. Siga o convite.
- **Não fechar.** Terminar sem resumo de trade-offs e riscos deixa a impressão de que você desenha, mas não opera.
- **Descrever o produto em vez do sistema.** A pergunta é como funciona, não o que o usuário sente.

## Checklist de domínio

- [ ] Você consegue listar as cinco fases e o tempo de cada uma sem consultar
- [ ] Você fecha escopo com três perguntas funcionais e três não-funcionais em menos de oito minutos
- [ ] Você escolhe dois deep dives amarrados aos requisitos e justifica a escolha
- [ ] Você fecha a entrevista com trade-offs, riscos e métricas de operação
- [ ] Você reconhece uma pergunta de falha disfarçada e a transforma em discussão de degradação

## Para ir além

- [System Design Primer](https://github.com/donnemartin/system-design-primer) — o roteiro colaborativo mais usado para treinar o formato.
- [ByteByteGo](https://bytebytego.com/) — designs visuais e explicações curtas para revisão espaçada.
- [Google SRE Book](https://sre.google/sre-book/table-of-contents/) — a base de confiabilidade que separa desenho bonito de sistema operável.
- [Patterns of Distributed Systems](https://martinfowler.com/articles/patterns-of-distributed-systems/) — catálogo de Martin Fowler para nomear e comparar soluções.
