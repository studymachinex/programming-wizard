> **Em uma frase:** recuperar é decidir o que fazer quando a falha chega; retry é apostar que ela é temporária — e as duas decisões precisam ser explícitas no código.

Em Mutiny, uma falha não desaparece porque você não a tratou: ela cancela a cadeia e chega ao assinante. `onFailure()` existe para você escolher entre observar, traduzir, repetir ou substituir o resultado. A escolha errada transforma indisponibilidade em dado falso ou em tempestade de requisições.

## O problema

O `catch (Exception e) { return List.of(); }` do código bloqueante reaparece no reativo como `recoverWithItem(List.of())`. A diferença é que agora ele pode estar no meio de um pipeline usado por dez consumidores, e ninguém vê que o banco caiu: todos recebem uma lista vazia perfeitamente válida. O sintoma aparece dias depois, quando o relatório está errado.

O outro extremo é o retry sem limite. Uma dependência já degradada recebe mais tráfego justamente quando precisa de menos, consome conexões e threads, e o timeout de cada tentativa se soma ao tempo total. Retry não é resiliência por si só; é uma aposta que precisa de prazo, limite e uma operação idempotente.

## Como funciona

`onFailure()` é um grupo de operadores. Ele não trata a falha sozinho; você escolhe a estratégia:

| Operador | O que faz | Quando usar |
|---|---|---|
| `invoke(Consumer<Throwable>)` | Efeito colateral e propaga a mesma falha | Métrica, log, auditoria |
| `transform(Function<Throwable, Throwable>)` | Traduz a exceção e propaga a nova | Converter erro de biblioteca em erro de domínio |
| `recoverWithItem(T)` | Substitui por um item imediato | Fallback estático e seguro |
| `recoverWithUni(Supplier<Uni<T>>)` | Delega para outra operação assíncrona | Fallback que consulta cache ou réplica |
| `retry().atMost(n)` | Repete no máximo `n` vezes | Falha transitória conhecida |
| `retry().withBackOff(...)` | Aumenta o intervalo entre tentativas | Dependência sobrecarregada |
| `retry().expireIn(ms)` | Impõe um orçamento total de tempo | Quando o chamador tem deadline |

`atMost(3)` significa três novas tentativas, ou seja, até quatro assinaturas no total. O backoff é exponencial entre o valor inicial e o máximo; `withJitter(0.3)` randomiza a espera em ±30%, evitando que todos os clientes tentem no mesmo instante.

Classifique a falha antes de configurar qualquer coisa. Timeout, conexão recusada, `503` e reset de conexão são transitórios. `400`, `401`, `404`, violação de constraint e erro de validação são permanentes: repetir só gasta tempo. E só faça retry de operação idempotente; um `POST` de cobrança que deu timeout pode ter sido processado.

## Na prática

Um cliente de saldo com retry limitado e fallback explícito:

```java
package com.exemplo.saldo;

import io.smallrye.mutiny.Uni;
import java.time.Duration;
import java.util.concurrent.TimeoutException;

public class ConsultaSaldo {

    private final BancoClient banco;
    private final Metricas metricas;

    public ConsultaSaldo(BancoClient banco, Metricas metricas) {
        this.banco = banco;
        this.metricas = metricas;
    }

    public Uni<Saldo> porConta(String conta) {
        return banco.saldo(conta)
            .onFailure(TimeoutException.class)
                .retry()
                .withBackOff(Duration.ofMillis(100), Duration.ofSeconds(2))
                .withJitter(0.3)
                .atMost(3)
            .onFailure()
                .invoke(erro -> metricas.falha("saldo", erro.getClass().getSimpleName()))
            .onFailure()
                .recoverWithItem(erro -> Saldo.indisponivel(mascara(conta)));
    }

    private static String mascara(String conta) {
        return conta.length() <= 4 ? "****" : "****" + conta.substring(conta.length() - 4);
    }
}
```

Repare em três decisões: o retry só vale para timeout, o fallback é um item que o domínio sabe interpretar (`indisponivel`) e a métrica usa a classe da exceção, não a mensagem. Mensagens de erro costumam carregar SQL, CPF, e-mail ou token.

Quando o fallback é outra operação, use `recoverWithUni`. Ele também pode falhar, então trate o resultado:

```java
return banco.saldo(conta)
    .onFailure().recoverWithUni(() -> cache.saldo(conta))
    .onFailure().recoverWithItem(Saldo.indisponivel(mascara(conta)));
```

Se o que importa é o orçamento total e não o número de tentativas, troque `atMost` por `expireIn`. O retry para quando o prazo acaba, mesmo que ainda restem tentativas. O valor precisa ser menor que o timeout do chamador; caso contrário, você trabalha para uma resposta que já foi abandonada.

```java
return banco.saldo(conta)
    .onFailure(TimeoutException.class)
        .retry()
        .withBackOff(Duration.ofMillis(100), Duration.ofSeconds(2))
        .withJitter(0.3)
        .expireIn(2_000);
```

Posicione o retry o mais perto possível da chamada que falha. Se ele envolver também o `persist` ou a publicação de evento que vêm depois, uma nova tentativa repete efeitos já concluídos. Traduza exceções na borda e mantenha o resto do sistema falando a linguagem do domínio. `onCancellation().invoke(...)` é o lugar de liberar recurso ou contar cancelamentos; ele não é chamado quando há falha, apenas quando o assinante cancela. Já `onTermination().invoke(...)` cobre item, falha e cancelamento — útil para métricas de duração.

## Armadilhas comuns

- `retry().indefinitely()`: nunca termina e amplifica a indisponibilidade.
- `recoverWithItem(null)`: Mutiny não emite `null`; isso vira falha. Use `recoverWithNull()` apenas se o tipo permitir ausência.
- Recuperar `IllegalArgumentException` ou erro de programação: o bug fica escondido atrás de um valor default.
- Fazer fallback chamando a mesma dependência que acabou de falhar, sem cache nem réplica.
- Logar `erro.getMessage()` e o payload inteiro em nome da observabilidade.
- Colocar o retry longe da chamada e repetir o caso de uso inteiro, incluindo efeitos já concluídos.

## Checklist de domínio

- [ ] Sei classificar a falha como transitória ou permanente antes de escolher a política.
- [ ] Uso `atMost` com backoff e jitter; nunca retry infinito.
- [ ] Sei que `atMost(n)` são `n` retries e até `n + 1` tentativas.
- [ ] Não repito operação não idempotente sem chave de idempotência.
- [ ] Distingo recuperar com item, delegar para outro `Uni` e apenas observar.
- [ ] Logs e métricas não carregam dado pessoal, payload ou mensagem crua da dependência.

## Para ir além

Leia o tutorial de retry do Mutiny e o guia de falhas do Quarkus. Depois escreva um teste que prove que o retry só acontece para timeout e que o fallback não é acionado em erro de validação.

- [Mutiny — Retrying on failures](https://smallrye.io/smallrye-mutiny/2.9.5/tutorials/retrying/)
- [Mutiny — Handling failures](https://smallrye.io/smallrye-mutiny/2.9.5/tutorials/handling-failures/)
- [Quarkus — Mutiny primer](https://quarkus.io/guides/mutiny-primer)
