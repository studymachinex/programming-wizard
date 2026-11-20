> **Em uma frase:** SLO é uma promessa medida na perspectiva do usuário; error budget é o direito de gastar essa promessa em troca de velocidade.

## O problema

O alerta de CPU dispara 300 vezes por semana. Ninguém olha. Em uma quinta-feira, o checkout fica 40 minutos fora e o time descobre pelo Twitter. A métrica estava verde porque a CPU estava baixa — o banco estava travado.

Alertar por causa é fácil; alertar por sintoma que importa é arquitetura. SLO transforma "está lento" em um número acordado, com consequência.

## Como funciona

**SLI** é uma razão: eventos bons / eventos válidos. Para disponibilidade, bons são respostas 2xx/3xx e válidos excluem 4xx de cliente. Para latência, bons são requisições abaixo de 300 ms. Para frescor, bons são leituras com lag abaixo de 5 s.

**SLO** é o alvo em uma janela. 99,9% em 30 dias significa 43 minutos e 12 segundos de indisponibilidade permitida. A conta: 30 × 24 × 60 = 43.200 minutos; 0,1% = 43,2.

| SLO | Indisponibilidade/mês |
|---|---|
| 99% | 7h 12min |
| 99,9% | 43min 12s |
| 99,95% | 21min 36s |
| 99,99% | 4min 19s |

**Error budget** é 1 − SLO. Ele é um recurso: se sobra budget, você pode arriscar deploys; se queima rápido, prioriza estabilidade. **Burn rate** mede a velocidade: 1× esgota o budget no fim da janela; 14,4× esgota 2% em uma hora de uma janela de 30 dias.

```java
import java.time.Duration;

record Slo(double target, Duration window) {
    Slo {
        if (target <= 0 || target >= 1) throw new IllegalArgumentException("target entre 0 e 1");
    }

    Duration errorBudget() {
        return Duration.ofNanos((long) (window.toNanos() * (1.0 - target)));
    }

    // 1.0 = queima o budget exatamente ao fim da janela.
    double burnRate(long badEvents, long totalEvents) {
        double badRatio = (double) badEvents / totalEvents;
        return badRatio / (1.0 - target);
    }

    Duration timeToExhaustion(long badEvents, long totalEvents) {
        double burn = burnRate(badEvents, totalEvents);
        if (burn <= 0) return Duration.ofDays(3650);
        return Duration.ofNanos((long) (window.toNanos() / burn));
    }
}
```

Com 1% de erros e SLO de 99,9%, `burnRate` retorna 10 e `timeToExhaustion` retorna três dias. É o número que decide se o deploy de sexta continua.

```java
record WindowedSli(long good, long total) {
    double ratio() { return total == 0 ? 1.0 : (double) good / total; }
}

record BurnAlert(Duration longWindow, Duration shortWindow, double threshold) { }

final class SloAlerter {
    // As duas janelas precisam queimar: evita página por pico curto.
    boolean shouldPage(Slo slo, WindowedSli longWin, WindowedSli shortWin, BurnAlert alert) {
        return burn(slo, longWin) > alert.threshold()
                && burn(slo, shortWin) > alert.threshold();
    }

    private double burn(Slo slo, WindowedSli w) {
        return (1.0 - w.ratio()) / (1.0 - slo.target());
    }
}
```

A configuração clássica usa três pares: 14,4× em 1 h (página), 6× em 6 h (página), 1× em 3 dias (ticket). O par curto confirma que o problema continua; o longo evita alertar por ruído.

### Capacidade

Lei de Little: `L = λ × W`. Com 10 mil requisições por segundo e 100 ms de tempo médio, há mil requisições em andamento. Se o tempo dobra, a concorrência dobra — e o pool precisa acompanhar.

Fila não é linear. Com utilização ρ, a espera cresce perto de ρ/(1−ρ): 70% já é 2,3× o tempo de serviço; 90% é 9×; 95% é 19×. Manter 50–70% de utilização não é desperdício; é o que impede um pico de 2× de virar colapso.

## Na prática

Escolha poucos SLIs, na jornada que gera receita: "compra concluída em menos de 2 s", "login bem-sucedido", "feed carrega em menos de 1 s". Meça no ponto mais próximo do usuário que você controla — load balancer ou cliente sintético, não a CPU do pod.

Defina a política do budget antes do incidente: budget acima de 20% → deploys normais; 5–20% → revisão extra; abaixo de 5% → congelamento e foco em confiabilidade. Sem consequência, o budget é um dashboard.

Cuidado com dependências: cinco dependências a 99,95% em série dão 99,75%. Se o SLO é 99,9%, você já começa devendo.

## Armadilhas comuns

- **Média de latência.** p50 de 20 ms esconde p99 de 4 s. SLO de latência usa percentil e proporção.
- **SLO de 100%.** Custa infinito e proíbe deploy. Escolha o número que o negócio precisa.
- **Alertar por causa.** CPU alta pode ser saudável; erro de usuário não.
- **Medir no servidor.** O cliente pode falhar antes de chegar ao servidor.
- **Budget sem dono.** Ninguém decide o que fazer quando ele acaba.

## Checklist de domínio

- [ ] Você escreve um SLI como razão de eventos bons e válidos
- [ ] Você calcula o budget de 99,9% em 30 dias
- [ ] Você explica burn rate de 14,4× e por que ele importa
- [ ] Você dimensiona concorrência com a Lei de Little
- [ ] Você define a política de congelamento por budget

## Para ir além

- [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/) — o capítulo que definiu a prática.
- [Implementing SLOs](https://sre.google/workbook/implementing-slos/) — workbook com exemplos de SLIs.
- [Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/) — janelas e burn rates.
