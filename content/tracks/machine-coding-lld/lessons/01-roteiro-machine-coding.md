> **Em uma frase:** machine coding avalia se você entrega em 60–90 minutos um código pequeno, correto, extensível e que roda, e não se você conhece todos os design patterns.

## O problema

Uber, DoorDash, Airbnb, Flipkart e boa parte das empresas que pagam acima da média têm uma rodada que não é LeetCode nem system design: "implemente um estacionamento", "implemente um rate limiter", "implemente o Splitwise". O entrevistador quer **código rodando** no fim, normalmente com um `main` ou com testes, e depois vai pedir extensões: "e se agora houver vagas para carro elétrico?", "e se duas cancelas chamarem ao mesmo tempo?".

O erro mais comum de quem é bom em LeetCode é tratar a rodada como algoritmo: escrever uma classe gigante com tudo dentro e nenhuma fronteira. O erro mais comum de quem é bom em arquitetura é o oposto: gastar 40 minutos desenhando 14 interfaces e não conseguir rodar nada. Os dois reprovam.

## Como funciona

A rodada tem quatro fases. Controle o relógio, porque o entrevistador também controla.

| Fase | Tempo (em 75 min) | Entregável |
|---|---|---|
| Requisitos | 5–8 min | Lista do que está dentro e do que está fora |
| Modelo | 8–10 min | Entidades, responsabilidades e 1–3 interfaces |
| Código | 35–45 min | Caminho feliz rodando e depois os erros |
| Extensões | 10–15 min | Mudança pedida sem reescrever o núcleo |

### 1. Requisitos: feche o escopo em voz alta

Pergunte o que muda o modelo, não o que muda detalhe. Num estacionamento: há tamanhos diferentes de vaga? Um veículo pequeno pode ocupar vaga grande? Como se cobra? Existe reserva? Escreva a lista no editor como comentário. Ela vira seu contrato e protege você de requisitos que mudam no minuto 50.

### 2. Modelo: substantivos viram classes, variações viram interfaces

Liste os substantivos (Vaga, Veículo, Ticket, Tarifa) e marque o que **varia**: a regra de preço varia, então vira interface. O tamanho da vaga não varia em comportamento, então vira enum. Essa é a regra prática para não exagerar: **só existe interface onde existe uma segunda implementação plausível**.

```java
// Variação real -> interface. Dado sem comportamento -> enum ou record.
enum TamanhoVaga { MOTO, CARRO, GRANDE }

record Ticket(String id, String placa, String vagaId, long entradaMillis) {}

interface Tarifa {
    long calcularCentavos(long duracaoMillis, TamanhoVaga vaga);
}
```

### 3. Código: caminho feliz primeiro, com dependências injetadas

Duas injeções resolvem metade dos problemas de teste em machine coding: **relógio** e **gerador de id**. Quem chama `System.currentTimeMillis()` dentro da regra de negócio não consegue testar TTL, tarifa nem janela de rate limit sem `Thread.sleep`.

```java
import java.util.function.LongSupplier;

public class Demo {
    static class Relogio {
        static LongSupplier sistema() { return System::currentTimeMillis; }
    }

    public static void main(String[] args) {
        long[] agora = {0};
        LongSupplier relogioFalso = () -> agora[0]; // nos testes, você controla o tempo
        agora[0] += 15 * 60_000;                    // "passaram 15 minutos"
        System.out.println(relogioFalso.getAsLong()); // 900000
        System.out.println(Relogio.sistema().getAsLong() > 0);
    }
}
```

Escreva primeiro o fluxo que o entrevistador vai executar. Só depois trate os erros de domínio (placa duplicada, ticket inválido) com exceções específicas e mensagens claras. Não use `catch (Exception e) {}` em lugar nenhum.

### 4. Extensões: mostre que o modelo aguenta

Quando vier "e se...", responda primeiro **onde** a mudança entra ("é uma nova implementação de `Tarifa`, o `Estacionamento` não muda") e depois escreva. Se a mudança exigir mexer em cinco classes, diga isso com honestidade e explique qual fronteira faltou.

## Na prática

O que o entrevistador anota, em ordem de peso:

1. **Roda e está correto** nos casos que ele testar, inclusive os de borda.
2. **Separação de responsabilidades**: dá para apontar quem decide o quê.
3. **Extensibilidade proporcional**: interfaces onde há variação real, e não em tudo.
4. **Nomes e legibilidade**: dá para ler sem você explicar.
5. **Concorrência e escala**, como discussão no fim, com uma mudança concreta (lock por vaga, `ConcurrentHashMap`, fila).

Um detalhe de quem já passou por isso: muitas empresas rodam **os próprios testes ocultos** no seu código depois da entrevista. Assinaturas exatamente como combinadas e comportamento determinístico (ordem de saída, desempates) valem pontos que você nem vê.

## Armadilhas comuns

- **Começar pelo diagrama de classes inteiro.** Desenhe só o suficiente para começar o código. O modelo vai mudar quando você escrever.
- **Herança para variar comportamento** (`CarroEletricoTicket extends Ticket`). Use composição e Strategy. Herança engessa a extensão que o entrevistador vai pedir.
- **Singletons globais** (`Estacionamento.getInstance()`). Eles impedem testes isolados e não trazem nada numa entrevista.
- **Ignorar desempates.** "Qualquer vaga livre" vira bug quando o teste espera a de menor andar. Defina a ordem e diga em voz alta.
- **Dinheiro em `double`.** Use centavos em `long` ou `BigDecimal`. Isso é reprovação em fintech.

## Checklist de domínio

- [ ] Você divide 75 minutos nas quatro fases sem olhar o relógio a cada minuto
- [ ] Você justifica cada interface com uma segunda implementação plausível
- [ ] Você injeta relógio e ids em qualquer regra que dependa de tempo
- [ ] Você responde "onde essa mudança entra" antes de escrever a extensão

## Para ir além

- [Awesome Low Level Design, de Ashish Pratap Singh](https://github.com/ashishps1/awesome-low-level-design): catálogo de problemas de LLD com soluções em Java.
- [Refactoring Guru: Strategy](https://refactoring.guru/design-patterns/strategy): o padrão que mais aparece em machine coding.
- [Martin Fowler: Inversion of Control Containers and the Dependency Injection pattern](https://martinfowler.com/articles/injection.html): a base de injetar relógio e colaboradores.
