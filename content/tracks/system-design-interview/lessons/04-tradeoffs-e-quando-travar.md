> **Em uma frase:** toda decisão de arquitetura compra alguma coisa e paga com outra; quem não declara o preço está vendendo ilusão.

## O problema

O entrevistador pergunta: "SQL ou NoSQL?". Você responde: "depende". Ele espera. Você continua: "depende do volume, do padrão de acesso, da consistência...". A resposta está tecnicamente correta e é inútil. Ele não quer uma aula sobre possibilidades; quer ver você escolher com os dados que tem e assumir as consequências.

O oposto também falha. "Vou usar NoSQL porque escala" é uma decisão sem contexto, sem alternativa e sem custo. Se o sistema precisa de transações entre duas entidades e consultas ad hoc, o NoSQL escolhido por reflexo vira um problema que você vai pagar por anos. Arquitetura é a arte de escolher qual problema você prefere ter.

A entrevista testa exatamente isso: sob informação incompleta, você consegue produzir uma decisão defensável, comunicá-la e dizer quando ela deixaria de valer? Quem trava esperando certeza perde tempo; quem decide sem critério perde credibilidade.

## Como funciona

Use um formato de decisão explícito. Ele cabe em cinco frases e pode ser dito em voz alta:

1. **Contexto:** "Temos 5.000 escritas/s e leitura por chave, com p99 de 100 ms."
2. **Opções reais:** "Postgres com partição por merchant, ou DynamoDB com partition key."
3. **Critério:** "O que mais pesa é custo operacional e transação entre pedido e ledger."
4. **Decisão:** "Fico com Postgres agora; o volume cabe e a transação local elimina uma classe de bugs."
5. **Consequência e gatilho:** "Pago com teto de escrita por nó e sharding manual depois; se passarmos de 20 mil escritas/s ou precisarmos multi-região ativa, reavalio."

Essa estrutura é uma ADR falada. Ela mostra contexto, alternativa, critério e condição de revisão. O entrevistador pode discordar da decisão e ainda assim dar nota alta, porque o processo é sólido.

### Os trade-offs que mais aparecem

| Escolha | Ganha | Paga |
|---|---|---|
| Consistência forte | Correção simples de raciocinar | Latência, indisponibilidade em partição |
| Consistência eventual | Disponibilidade e latência | Conflitos, leituras stale, reconciliação |
| Cache agressivo | Latência e alívio no banco | Dados velhos, invalidação, stampede |
| Fila assíncrona | Desacoplamento e absorção de pico | Latência, duplicatas, ordering complexo |
| Sharding | Escala horizontal de escrita | Transações cross-shard, rebalanceamento |
| Microsserviços | Times autônomos e deploy independente | Latência de rede, observabilidade, consistência |
| Monólito | Simplicidade e transações locais | Acoplamento de deploy e escala uniforme |
| Build interno | Controle e diferenciação | Custo de engenharia e operação |

CAP merece precisão. O teorema diz que, durante uma partição de rede, você escolhe consistência ou disponibilidade. Partições são raras; latência é diária. Por isso o modelo PACELC é mais útil: mesmo sem partição (E), você troca latência (L) por consistência (C). Uma réplica síncrona cross-region adiciona 150 ms a cada escrita para garantir que o dado exista em dois lugares. Se o requisito tolera 5 segundos de atraso, esse preço é desnecessário.

### Como comunicar sem parecer indeciso

Use a fórmula "escolho X porque Y; pago Z; se W, reviso". Uma decisão por vez. Se o entrevistador questionar, não recomece o desenho: volte ao critério. "Se a prioridade for latência em vez de consistência, a resposta muda para X'; eu escolhi consistência porque o caso é pagamento." Isso mostra que você tem um modelo mental, não um script.

Quando não souber algo, seja específico sobre a lacuna: "não lembro os detalhes do protocolo Raft, mas o problema é eleger um líder sem split-brain; eu resolveria com um serviço de coordenação gerenciado e lease". Você preserva a conversa e demonstra que entende o problema, mesmo sem a implementação exata.

### Quando você trava

Travar não é falha; travar em silêncio é. Tenha uma escada de recuperação:

1. **Reformule o problema em uma frase.** Se não conseguir, você não entendeu o que está sendo pedido.
2. **Volte ao fluxo.** Desenhe o caminho de uma requisição e marque onde está a dúvida.
3. **Liste duas opções, não dez.** Compare uma dimensão por vez.
4. **Escolha a mais simples que atende aos requisitos.** Diga o que ela não faz.
5. **Peça uma dica específica.** "Posso assumir que o usuário aceita consistência eventual no feed?" é melhor que "estou perdido".

```java
import java.util.Comparator;
import java.util.List;
import java.util.Map;

public class DecisionMatrix {

    public record Option(String name, Map<String, Integer> scores) {}

    public record Criterion(String name, double weight) {}

    public static double score(Option option, List<Criterion> criteria) {
        return criteria.stream()
            .mapToDouble(c -> option.scores().getOrDefault(c.name(), 0) * c.weight())
            .sum();
    }

    public static void main(String[] args) {
        var criteria = List.of(
            new Criterion("consistencia", 0.35),
            new Criterion("custo", 0.25),
            new Criterion("operacao", 0.20),
            new Criterion("latencia", 0.20)
        );
        var options = List.of(
            new Option("Postgres", Map.of("consistencia", 5, "custo", 4, "operacao", 4, "latencia", 3)),
            new Option("DynamoDB", Map.of("consistencia", 3, "custo", 3, "operacao", 5, "latencia", 5))
        );
        options.stream()
            .sorted(Comparator.comparingDouble((Option o) -> score(o, criteria)).reversed())
            .forEach(o -> System.out.printf("%-10s %.2f%n", o.name(), score(o, criteria)));
    }
}
```

```java
import java.util.List;
import java.util.function.Supplier;

public class FallbackChain<T> {

    private final List<Supplier<T>> steps;

    public FallbackChain(List<Supplier<T>> steps) {
        this.steps = List.copyOf(steps);
    }

    public T get() {
        RuntimeException last = null;
        for (Supplier<T> step : steps) {
            try {
                T value = step.get();
                if (value != null) {
                    return value;
                }
            } catch (RuntimeException e) {
                last = e;
            }
        }
        throw last != null ? last : new IllegalStateException("todos os fallbacks vazios");
    }

    public static void main(String[] args) {
        var feed = new FallbackChain<String>(List.of(
            () -> null,                       // ranking personalizado indisponível
            () -> "feed cronológico em cache", // degradação
            () -> "lista de posts populares"   // último recurso
        ));
        System.out.println(feed.get());
    }
}
```

## Na prática

Considere notificações. O caminho síncrono é simples: a API grava a notificação e chama APNs/FCM antes de responder. O caminho assíncrono enfileira e responde 202. Qual escolher?

Se o requisito é "o usuário vê a notificação em até 2 segundos" e o provedor tem p99 de 300 ms, o síncrono cabe. Mas se o provedor cai, a API de negócio cai junto. Com fila, a API responde em 20 ms, absorve picos de 50 mil/s e tenta de novo; o custo é latência eventual, duplicatas e a necessidade de idempotência. A decisão madura: fila para o envio, com um caminho síncrono apenas para notificações transacionais críticas, e fallback para in-app.

Outro exemplo: feed com fanout on write versus on read. Fanout on write pré-calcula a timeline de cada seguidor; leitura fica O(1), mas uma celebridade com 100 milhões de seguidores gera 100 milhões de escritas. Fanout on read consulta os posts de quem você segue na hora; escrita é barata, leitura é cara e imprevisível. O híbrido existe porque nenhum dos dois vence em todos os casos. A decisão não é "qual é melhor", é "qual custo eu prefiro pagar para este usuário".

## Armadilhas comuns

- **Falso dilema.** "SQL ou NoSQL" ignora NewSQL, search engine, object storage e uma combinação deles. Sempre pergunte se há uma terceira opção mais simples.
- **Comparar sem critério.** Uma matriz sem pesos é uma lista de opiniões. Diga o que mais importa antes de pontuar.
- **Ignorar custo operacional.** Um sistema elegante que exige três times para operar é pior que um Postgres bem cuidado.
- **Sunk cost.** "Já desenhei com Kafka, vou manter" não é argumento. O desenho é uma proposta, não um contrato emocional.
- **Over-engineering por medo.** "Vou preparar para 1 bilhão de usuários" quando o requisito é 100 mil é uma forma de não decidir.
- **Não revisitar.** Trade-off tem gatilho. Se o volume triplicou e você não mudou nada, a decisão virou dogma.

## Checklist de domínio

- [ ] Você consegue enunciar uma decisão em cinco frases: contexto, opções, critério, escolha e consequência
- [ ] Você explica PACELC sem recitar CAP de forma mecânica
- [ ] Você tem uma escada de recuperação para quando travar
- [ ] Você diferencia "não sei o detalhe" de "não sei o problema"
- [ ] Você define o gatilho que faria você rever a decisão

## Para ir além

- [Patterns of Distributed Systems](https://martinfowler.com/articles/patterns-of-distributed-systems/) — trade-offs concretos de replicação, consenso e leases.
- [CAP Twelve Years Later](https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/) — a explicação de Eric Brewer sobre o que CAP realmente diz.
- [PACELC](https://en.wikipedia.org/wiki/PACELC_theorem) — o modelo que captura o custo de latência no dia a dia.
- [Avoiding Fallback in Distributed Systems](https://aws.amazon.com/builders-library/avoiding-fallback-in-distributed-systems/) — quando degradar ajuda e quando cria um novo ponto de falha.
