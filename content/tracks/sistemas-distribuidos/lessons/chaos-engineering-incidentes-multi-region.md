> **Em uma frase:** resiliência não é ter um plano no wiki; é ter ensaiado a falha, medido o impacto e reduzido o raio de explosão antes que o incidente real escolha a hora.

## O problema

O plano de DR promete failover em 15 minutos. Ninguém testou. Quando a região primária cai, o time descobre que o runbook aponta para um dashboard removido, que o standby tem 30% da capacidade e que o DNS tinha TTL de 24 horas. O failover leva 47 minutos e o checkout perde R$ 1,8 milhão em GMV.

Chaos engineering existe para descobrir isso em uma terça de manhã, com o time descansado, em vez de na Black Friday.

## Como funciona

### Experimento de caos

Um experimento tem cinco partes: hipótese, steady state mensurável, variável injetada, blast radius e critério de abort. "Matar pods" não é experimento; "matar 10% dos pods de catálogo e verificar que o p99 fica abaixo de 300 ms e o erro abaixo de 0,5%" é.

Comece em staging, depois 1% do tráfego, depois uma AZ. O blast radius cresce só depois que o anterior passou.

```java
import java.time.Duration;

record ChaosExperiment(
        String name,
        String hypothesis,
        double blastRadiusPercent,
        Duration maxDuration,
        double abortAboveErrorRate) {

    ChaosExperiment {
        if (blastRadiusPercent <= 0 || blastRadiusPercent > 25) {
            throw new IllegalArgumentException("comece com blast radius <= 25%");
        }
        if (maxDuration.isZero() || maxDuration.isNegative()) {
            throw new IllegalArgumentException("experimento precisa de duração máxima");
        }
    }

    boolean shouldAbort(double observedErrorRate) {
        return observedErrorRate > abortAboveErrorRate;
    }
}
```

O abort precisa ser automático. Se o experimento aumenta o erro acima do limite, ele para sozinho — não depende de alguém olhar o gráfico.

### Incident response

Em um incidente, papéis explícitos reduzem o caos: **incident commander** decide prioridades e coordena, **ops lead** executa a mitigação, **comms lead** fala com clientes e stakeholders. Declare cedo; um SEV-3 que ninguém declarou vira SEV-1 silencioso.

O postmortem é blameless: foca em causas sistêmicas, não em culpa individual. "O operador rodou o comando errado" não é causa; "o comando destrutivo não tinha confirmação nem dry-run" é.

### Multi-region

| Estratégia | RTO típico | RPO típico | Custo |
|---|---|---|---|
| Backup/restore | horas | horas | baixo |
| Pilot light | 30–60 min | minutos | médio |
| Warm standby | 5–15 min | segundos | alto |
| Active-active | < 1 min | ~0 | muito alto |

Warm standby com 30% da capacidade não absorve 100% da carga. Ou você escala em minutos (e testou isso), ou degrada funcionalidades: desliga recomendações, reduz catálogo, mantém checkout.

```java
record RegionPlan(String name, double capacityShare, int scaleUpMinutes) { }

final class FailoverPlan {
    private final RegionPlan standby;
    private final int detectionMinutes;

    FailoverPlan(RegionPlan standby, int detectionMinutes) {
        this.standby = standby;
        this.detectionMinutes = detectionMinutes;
    }

    // RTO = detecção + promoção + tempo até a capacidade ficar utilizável.
    int rtoMinutes() {
        boolean precisaEscalar = standby.capacityShare() < 1.0;
        return detectionMinutes + 2 + (precisaEscalar ? standby.scaleUpMinutes() : 0);
    }

    boolean meets(int targetMinutes) {
        return rtoMinutes() <= targetMinutes;
    }
}
```

Se a detecção leva cinco minutos, a promoção dois e a escala vinte, o RTO é 27 minutos — não os 15 prometidos. O número tem que entrar no design doc.

## Na prática

Rode game days trimestrais com um cenário por vez: perda de AZ, latência de 2 s no banco, falha do provedor de pagamento, expiração de certificado. Cada um tem hipótese, dono e critério de sucesso.

Para DR, meça o RTO a partir da falha, não da detecção. E teste o caminho completo: DNS, balanceador, conexões, pools, cache, filas. Um detalhe de produção que derruba failover: pools de conexão e clients HTTP mantêm IPs antigos; sem recriar conexões, você continua batendo na região morta mesmo com o DNS atualizado.

## Armadilhas comuns

- **Caos sem abort.** Se não há como parar automaticamente, é vandalismo.
- **Testar só em staging.** Produção tem carga, dados e dependências que staging não tem.
- **Warm standby sem escala comprovada.** Capacidade não aparece por mágica.
- **RTO contado da detecção.** O usuário conta do primeiro erro.
- **Postmortem sem ação.** Sem dono e prazo, o mesmo incidente volta.

## Checklist de domínio

- [ ] Você escreve hipótese, steady state e abort de um experimento
- [ ] Você define blast radius inicial e critério de expansão
- [ ] Você estrutura papéis de comando de incidente
- [ ] Você compara pilot light, warm standby e active-active por RTO/RPO
- [ ] Você calcula se a capacidade do standby absorve o pico

## Para ir além

- [Chaos Engineering](https://sre.google/workbook/chaos-engineering/) — capítulo do SRE Workbook.
- [Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) — o que blameless realmente significa.
- [Static stability using Availability Zones](https://aws.amazon.com/builders-library/static-stability-using-availability-zones/) — por que depender de escala no failover é frágil.
