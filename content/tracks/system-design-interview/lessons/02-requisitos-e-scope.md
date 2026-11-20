> **Em uma frase:** requisitos são o contrato que impede você de resolver o problema errado; sem escopo e SLOs, todo desenho é opinião.

## O problema

"Desenhe o Instagram" é um enunciado incompleto de propósito. Ele pode significar postar fotos, seguir pessoas, ver um feed, mandar mensagens, fazer live, anunciar, moderar conteúdo ou tudo isso. Se você não fechar o que está dentro e fora, vai gastar os 45 minutos desenhando um produto que o entrevistador não pediu — e ele vai avaliar sua capacidade de priorizar, não sua imaginação.

O segundo problema é que "rápido", "escalável" e "disponível" não são requisitos. São desejos. Um requisito não-funcional precisa de métrica, alvo e janela: "p99 do feed abaixo de 300 ms, 99,95% de disponibilidade mensal, consistência eventual de até 5 segundos". Sem isso, você não consegue decidir entre cache, réplica e fila, porque não sabe o que está tentando comprar.

Requisitos não são burocracia de início de entrevista. São a ferramenta que transforma um problema aberto em um sistema com fronteiras. Cada requisito que você aceita cobra um preço em complexidade, custo ou consistência. Fechar escopo é escolher quais preços valem a pena.

## Como funciona

Separe o enunciado em quatro caixas: funcional, não-funcional, restrição e fora de escopo. Cada uma tem um papel diferente.

**Funcionais** descrevem comportamentos observáveis. Use verbos e atores: "um usuário publica um post", "um seguidor vê posts de quem segue", "um usuário remove um post". Três a cinco histórias bem escolhidas são suficientes para uma entrevista. Priorize: P0 é o que sem aquilo não existe produto; P1 é importante, mas pode esperar; P2 é ruído que você corta. Em um feed, publicar e ler são P0; curtir é P1; trending topics é P2.

**Não-funcionais** descrevem qualidades mensuráveis. Os principais eixos:

| Eixo | Pergunta | Exemplo de alvo |
|---|---|---|
| Latência | Qual o p99 aceitável? | Feed em 300 ms; redirect em 50 ms |
| Disponibilidade | Quanto downtime por mês? | 99,95% = 21,6 min |
| Consistência | Quanto atraso é tolerável? | Feed eventual até 5 s; saldo forte |
| Durabilidade | Pode perder dado? | Zero perda em pagamentos |
| Escala | Qual o volume e o pico? | 500M DAU, pico 3x a média |
| Custo | Qual o orçamento por requisição? | US$ 0,002 por mil reads |

**Restrições** são dadas e não se discutem: stack existente, nuvem, região, orçamento, equipe, prazo, compliance. Elas mudam a resposta. "Só podemos usar AWS em us-east-1" elimina multi-região ativa-ativa. "Temos um time de quatro pessoas" elimina um data center próprio.

**Fora de escopo** é a lista do que você deliberadamente não vai desenhar. Não é fuga; é priorização explícita. "Vou assumir que autenticação, moderação e upload de mídia já existem; foco no feed e no fanout." Isso libera tempo para o que o entrevistador quer ver.

### Disponibilidade e orçamento de erro

Números de disponibilidade só significam algo quando convertidos em tempo. A conta é simples: um mês de 30 dias tem 43.200 minutos.

- 99,9% permite 43,2 minutos de indisponibilidade por mês.
- 99,95% permite 21,6 minutos.
- 99,99% permite 4,32 minutos.
- 99,999% permite 26 segundos.

Disponibilidade de dependências em série se multiplica. Três serviços com 99,9% cada, chamados em sequência, entregam 0,999³ ≈ 99,7% — cerca de 130 minutos por mês. É por isso que arquiteturas com muitas dependências síncronas prometem cinco noves e entregam três. O orçamento de erro também é uma ferramenta de decisão: se o feed pode falhar 21 minutos por mês, não faz sentido pagar por replicação síncrona em três regiões.

Latência também precisa de qualificador. Média engana. Um p50 de 50 ms com p99 de 2 segundos significa que uma em cada cem pessoas espera dois segundos. Em entrevista, diga p99 ou p95 e justifique: "p99 porque o feed é a primeira tela e cauda longa vira churn".

```java
import java.util.List;

public class RequirementScope {

    public enum Kind { FUNCIONAL, NAO_FUNCIONAL, RESTRICAO }
    public enum Priority { P0, P1, P2 }

    public record Requirement(String id, Kind kind, Priority priority, String description, String metric) {
        public Requirement {
            if (description == null || description.isBlank()) {
                throw new IllegalArgumentException("requisito sem descrição");
            }
        }
    }

    public static List<Requirement> mvp(List<Requirement> all) {
        return all.stream()
            .filter(r -> r.priority() == Priority.P0)
            .toList();
    }

    public static void main(String[] args) {
        var reqs = List.of(
            new Requirement("F1", Kind.FUNCIONAL, Priority.P0, "publicar post", "1 post a cada 2 s por usuário ativo"),
            new Requirement("F2", Kind.FUNCIONAL, Priority.P0, "ler feed", "20 leituras/dia por DAU"),
            new Requirement("N1", Kind.NAO_FUNCIONAL, Priority.P0, "latência do feed", "p99 < 300 ms"),
            new Requirement("N2", Kind.NAO_FUNCIONAL, Priority.P0, "disponibilidade", "99,95% mensal"),
            new Requirement("F3", Kind.FUNCIONAL, Priority.P2, "trending topics", "atualização a cada 5 min")
        );
        mvp(reqs).forEach(r -> System.out.printf("%s %-14s %s%n", r.id(), r.kind(), r.description()));
    }
}
```

```java
public class SloBudget {

    public static double allowedDowntimeMinutes(double availability, int days) {
        double totalMinutes = days * 24 * 60;
        return totalMinutes * (1.0 - availability);
    }

    public static double serialAvailability(double... services) {
        double result = 1.0;
        for (double availability : services) {
            result *= availability;
        }
        return result;
    }

    public static void main(String[] args) {
        System.out.printf("99,95%% em 30 dias: %.1f min%n", allowedDowntimeMinutes(0.9995, 30));
        System.out.printf("3 serviços 99,9%%: %.4f%% (%.1f min)%n",
            serialAvailability(0.999, 0.999, 0.999) * 100,
            allowedDowntimeMinutes(serialAvailability(0.999, 0.999, 0.999), 30));
    }
}
```

## Na prática

Enunciado: "desenhe o feed do Twitter". Em vez de aceitar tudo, feche assim:

**Funcionais P0:** publicar tweet (texto e mídia), seguir/deixar de seguir, ver feed cronológico ou ranqueado com paginação. **P1:** curtir, repostar, notificações. **P2:** busca, trending, anúncios.

**Não-funcionais:** 500 milhões de DAU; 100 milhões de tweets/dia; feed lido 20 vezes por DAU/dia, então 10 bilhões de leituras/dia — cerca de 115 mil QPS na média e 350 mil no pico. Latência p99 de 300 ms para a primeira página. Disponibilidade de 99,95% para leitura; publicação pode aceitar 99,9%. Consistência eventual de até 5 segundos: um tweet pode demorar a aparecer no feed de um seguidor, mas não pode desaparecer depois de publicado. Ordenação por relevância, não estritamente cronológica.

**Fora de escopo:** mensagens diretas, busca, anúncios, moderação, upload de vídeo. **Restrições:** feed serve tráfego global; orçamento de infraestrutura precisa justificar cache agressivo.

Veja como cada número muda uma decisão. As 10 bilhões de leituras/dia contra 100 milhões de escritas dão uma razão de 100:1. Isso empurra o desenho para fanout na escrita e cache na leitura, não para uma consulta que junta tweets de 200 seguidos a cada request. A consistência eventual de 5 segundos permite usar uma fila de fanout; consistência forte exigiria fanout síncrono e mataria a latência. A disponibilidade de 99,95% permite degradar o feed para uma lista em cache se o ranking cair.

Um requisito mal formulado, "o sistema deve ser escalável", vira três perguntas: escala para quantos usuários, em quanto tempo, e qual o custo aceitável? Se a resposta for "1 milhão de usuários no primeiro ano, com pico de 10x", você dimensiona para 10 milhões e evita desenhar para um bilhão. Escala sem prazo e orçamento é ansiedade, não engenharia.

## Armadilhas comuns

- **Tratar não-funcionais como enfeite.** Se você não tem SLO, não tem critério para escolher cache, réplica ou fila. Diga o número e o custo dele.
- **Perguntar funcionalidades em vez de restrições.** "Tem stories?" rende menos que "qual o volume e a latência?". Funcionalidade o entrevistador te conta; restrição você precisa descobrir.
- **Prometer cinco noves sem orçamento.** Cada nove adicional custa muito mais que o anterior. Diga o que você faz com o orçamento de erro.
- **Confundir consistência eventual com "dados errados".** Eventual significa convergência com atraso limitado; você precisa definir o limite e o que o usuário vê nesse intervalo.
- **Esquecer segurança e privacidade.** Em produtos com dados pessoais, retenção, exclusão e controle de acesso são requisitos, não detalhes de implementation.
- **Fechar escopo cedo demais e ignorar o entrevistador.** O escopo é uma proposta; se ele pedir para incluir notificações, ajuste e diga o que sai para caber no tempo.

## Checklist de domínio

- [ ] Você transforma um enunciado vago em 3–5 funcionais priorizados e 3–4 não-funcionais mensuráveis
- [ ] Você calcula downtime mensal para 99,9%, 99,95% e 99,99% sem calculadora
- [ ] Você explica por que disponibilidades em série se multiplicam
- [ ] Você declara o que está fora de escopo e por quê
- [ ] Você conecta cada requisito a uma decisão de arquitetura concreta

## Para ir além

- [Service Level Objectives — Google SRE](https://sre.google/sre-book/service-level-objectives/) — como transformar confiabilidade em número e orçamento.
- [Embracing Risk — Google SRE](https://sre.google/sre-book/embracing-risk/) — por que 100% de disponibilidade é a decisão errada.
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) — pilares e perguntas de requisitos usados em revisões reais.
- [Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) — por que 100 ms, 1 s e 10 s mudam a percepção do usuário.
