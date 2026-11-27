> **Em uma frase:** notificações são um pipeline com fan-out, preferências, deduplicação e retry — o usuário só vê o canal, mas o sistema é fila e estado.

Um serviço de notificações envia push, e-mail, SMS e in-app. Precisa respeitar preferências, evitar spam, garantir entrega e lidar com provedores lentos. O design é menos sobre o canal e mais sobre orquestração e idempotência.

## Requisitos

- 100M usuários, 1B notificações/dia.
- Latência < 5 s para push; e-mail pode ser assíncrono.
- Preferências por canal e quiet hours.
- Deduplicação e rate limit por usuário.
- Retry com DLQ e observabilidade.

## Capacity estimation

1B/dia ≈ 12k/s média, 50k/s no pico. Cada evento ~1 KB = 50 MB/s no pico. Filas com retenção de 7 dias: ~350 TB se tudo persistido; retenção menor e compactação reduzem.

## API

```text
POST /notificacoes {userId, tipo, payload, idempotencyKey}
GET  /preferencias/{userId}
PUT  /preferencias/{userId}
```

## Arquitetura

```text
Produtores --> API --> valida preferências --> dedup (Redis) --> fila por canal
                                                         --> worker push/email/SMS
                                                         --> provedor --> status
                                                         --> DLQ
```

1. API valida payload e chave de idempotência.
2. Consulta preferências (cache + BD).
3. Deduplica por `(userId, tipo, janela)`.
4. Publica em fila por canal e prioridade.
5. Worker renderiza template e chama provedor com timeout.
6. Atualiza status; falha vai para retry/DLQ.

## Decisões e trade-offs

- **Fila por canal:** isola falha de provedor; prioridade para transacional.
- **Dedup:** Redis com TTL; chave de idempotência do produtor.
- **Rate limit:** token bucket por usuário/canal para evitar spam.
- **Templates:** versionados; fallback se variável faltar.
- **Entrega:** at-least-once + idempotência no provedor quando possível.
- **Preferências:** consistência eventual aceitável; cache curto.

## Deduplicação em duas camadas

O entrevistador vai perguntar "como você garante que o usuário não recebe o mesmo push duas vezes?". A resposta honesta é que **exactly-once não existe** entre você e a Apple, o Google ou a operadora de SMS. O que existe é at-least-once com duas camadas de dedup:

1. **Na entrada:** o produtor manda uma `idempotencyKey` (ex.: `pedido-123:saiu-para-entrega`). Um `SET key NX EX 86400` no Redis aceita a primeira e descarta as repetições do produtor (retry de HTTP, reprocessamento de evento do Kafka).
2. **No envio:** o worker grava o status `ENVIADO` por `(notificacaoId, canal)` **antes** de confirmar a mensagem da fila. Se o worker morrer depois de chamar o provedor e antes de gravar, a mensagem volta e o usuário pode receber duas vezes. Essa janela é pequena e aceita. Para e-mail, o `Message-ID` fixo ajuda o cliente de e-mail a agrupar.

```java
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/** Versão em memória do SET NX EX do Redis, para mostrar a semântica. */
class Deduplicador {
    private final Map<String, Long> vistos = new ConcurrentHashMap<>();
    private final LongSupplier relogio;
    private final long ttlMillis;

    Deduplicador(LongSupplier relogio, Duration ttl) {
        this.relogio = relogio;
        this.ttlMillis = ttl.toMillis();
    }

    /** true na primeira vez que a chave aparece dentro do TTL; false para repetições. */
    boolean primeiraVez(String idempotencyKey) {
        long agora = relogio.getAsLong();
        boolean[] nova = {false};
        vistos.compute(idempotencyKey, (k, expiraEm) -> {
            if (expiraEm != null && expiraEm > agora) return expiraEm; // repetição dentro da janela
            nova[0] = true;
            return agora + ttlMillis;
        });
        return nova[0];
    }
}
```

Há ainda uma terceira camada, de produto: **colapsar** notificações parecidas. Dez curtidas em um minuto viram "Ana e mais 9 curtiram", com uma janela de agregação por `(usuário, tipo)` antes da fila de envio.

## Retries sem virar spam

- **Classifique o erro.** Timeout e 5xx do provedor são transitórios: tente de novo. Token de push inválido (`Unregistered` no APNs, `UNREGISTERED` no FCM) é permanente: apague o token e não tente mais. Retentar erro permanente queima cota e pode bloquear sua conta no provedor.
- **Backoff exponencial com jitter.** Sem jitter, mil workers que falharam juntos voltam juntos e derrubam o provedor de novo.
- **Prazo de validade.** "Seu entregador chegou" com 40 minutos de atraso é pior que nenhuma notificação. Cada tipo tem um `expiraEm`, e depois disso a mensagem vai para a DLQ sem envio.
- **Fallback de canal.** Push falhou de vez para um código de login? Mande SMS. A ordem de fallback faz parte das preferências.

```java
import java.util.concurrent.ThreadLocalRandom;

final class Backoff {
    private Backoff() {}

    /** Full jitter (AWS Architecture Blog): espera aleatória entre 0 e min(teto, base * 2^tentativa). */
    static long esperaMillis(int tentativa, long baseMillis, long tetoMillis) {
        long exp = baseMillis << Math.min(tentativa, 20); // evita overflow
        long limite = Math.min(tetoMillis, exp);
        return ThreadLocalRandom.current().nextLong(limite + 1);
    }

    static boolean deveTentarDeNovo(int tentativa, int maxTentativas, long agora, long expiraEm, boolean erroTransitorio) {
        return erroTransitorio && tentativa < maxTentativas && agora < expiraEm;
    }
}
```

## Gargalos

Provedor externo (limite e latência), fan-out para campanhas, renderização e picos. Campanhas devem ser agendadas e throttled, não disparadas de uma vez.

- **Campanha de 10M usuários:** quebre em lotes, respeite o rate limit do provedor (o APNs e o FCM têm cotas) e use uma fila de prioridade **separada** para que a campanha nunca atrase um código de login.
- **Fuso horário e quiet hours:** a campanha das 10h é enviada às 10h de cada fuso, o que espalha a carga naturalmente.

## Checklist de resposta

- [ ] Requisitos e números.
- [ ] Pipeline e filas por canal.
- [ ] Preferências e dedup.
- [ ] Retry/DLQ e status.
- [ ] Rate limit e prioridade.
- [ ] Dedup na entrada e no envio, e por que exactly-once não existe com provedores externos.
- [ ] Erro transitório vs. permanente, backoff com jitter e prazo de validade.

## Para ir além

- [AWS Architecture Blog: Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/): por que full jitter vence o backoff puro.
- [Firebase Cloud Messaging: códigos de erro](https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode): quais erros são permanentes e exigem apagar o token.
- Depois, desenhe o fluxo de uma campanha para 10M usuários sem atrasar notificações transacionais.
