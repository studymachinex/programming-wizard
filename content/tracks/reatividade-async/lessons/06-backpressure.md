> **Em uma frase:** backpressure é o consumidor ditar o ritmo; quando o produtor não pode desacelerar, você escolhe conscientemente entre buffer limitado, descarte ou erro — nunca entre “guardar tudo” e “torcer”.

Todo pipeline assíncrono tem dois lados com velocidades diferentes. Se o consumidor processa 800 eventos por segundo e a fonte produz 1.200, a diferença de 400 por segundo precisa ir para algum lugar. Esse “algum lugar” é uma fila, um descarte ou uma falha. O que não pode existir é uma fila sem limite disfarçada de solução.

## O problema

Um consumidor lê eventos de um sensor e grava cada um no banco. O sensor emite em rajadas de 5.000 por segundo; o banco sustenta 800. O time adiciona `onBackpressureBuffer()` para “não perder nada”. No começo funciona. Em vinte minutos, o heap está cheio, o GC passa a rodar sem parar e o processo cai — levando junto requisições que nada tinham a ver com o sensor.

O sintoma não é falta de memória; é falta de política. O buffer só transfere a diferença de ritmo para o futuro, e o futuro chega.

## Como funciona

Reactive Streams já define o mecanismo: o consumidor chama `request(n)` e o produtor só emite até a demanda acumulada. Backpressure é o nome desse controle. Quando a fonte não respeita a demanda — um broker que entrega lotes, um sensor que empurra, um `Subject` quente — o operador precisa escolher o que fazer com o excedente:

- **Buffer limitado:** guarda até N itens e sinaliza erro quando enche. Preserva dados, mas impõe um teto de memória e uma falha explícita.
- **Drop:** descarta itens novos quando o consumidor está ocupado. Serve para telemetria e amostragem; não para pagamentos.
- **Latest:** mantém apenas o item mais recente. Ideal para preço, status e UI, onde o valor antigo perde valor.
- **Error:** falha o stream imediatamente. Preferível quando perder um item é inaceitável e o produtor precisa saber.
- **Bloquear o produtor:** contrapressão real, mas só funciona se o produtor puder esperar. No event loop, é proibido.

No Reactor, a política fica explícita no operador. O exemplo abaixo limita o buffer, conta descartes e processa em ordem, com prefetch controlado:

```java
package br.com.loja.eventos;

import reactor.core.Disposable;
import reactor.core.publisher.BufferOverflowStrategy;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

public final class ProcessadorEventos {

    public Disposable iniciar(Flux<Evento> origem, Metricas metricas) {
        return origem
            .onBackpressureBuffer(
                1_000,
                descartado -> metricas.incrementar("buffer.descartado"),
                BufferOverflowStrategy.DROP_OLDEST)
            .publishOn(Schedulers.boundedElastic(), 64)
            .concatMap(this::persistir) // uma gravação por vez, em ordem
            .subscribe(
                ok -> metricas.incrementar("evento.gravado"),
                erro -> log.error("pipeline parou", erro));
    }

    private reactor.core.publisher.Mono<Void> persistir(Evento evento) {
        return reactor.core.publisher.Mono.fromRunnable(() -> repo.inserir(evento))
            .subscribeOn(Schedulers.boundedElastic())
            .then();
    }
}
```

O buffer de 1.000 é uma decisão de memória, não de performance. Se cada evento ocupa 2 KB, são 2 MB por pipeline; com 100 pipelines, 200 MB. `DROP_OLDEST` mantém o fluxo vivo e descarta o item mais antigo, o que é aceitável para métricas e ruim para eventos de negócio.

Na Mutiny, o equivalente é `onOverflow()`. `buffer(n)` é limitado e propaga `BackPressureFailure` quando chega ao teto; `drop()` descarta o novo; `dropPreviousItems()` mantém o mais recente; `bufferUnconditionally()` é ilimitado e deve ser tratado como último recurso.

```java
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.subscription.Cancellable;

public Cancellable iniciar(Stream<Evento> eventos, Metricas metricas) {
    return Multi.createFrom().emitter(em -> {
            eventos.forEach(em::emit); // fonte que não espera demanda
            em.complete();
        })
        .onOverflow().buffer(500)
        .onItem().transformToUniAndConcatenate(this::persistir)
        .onFailure().invoke(falha -> metricas.incrementar("pipeline.falha"))
        .subscribe().with(
            ok -> metricas.incrementar("evento.gravado"),
            erro -> log.error("pipeline parou", erro));
}
```

| Estratégia | Memória | Perde item? | Quando usar |
|---|---|---|---|
| Buffer limitado | Teto de N itens | Não até encher; depois falha | Picos curtos com consumidor que se recupera |
| Buffer ilimitado | Cresce sem teto | Não | Praticamente nunca |
| Drop | Nenhuma | Sim, os novos | Telemetria e amostragem |
| Latest | Um item | Sim, os antigos | Preço, status, UI |
| Error | Nenhuma | Falha explícita | Dados críticos |
| Bloquear produtor | Nenhuma | Não | Quando a fonte aceita desacelerar |

## Na prática

Dimensione pelo pior caso, não pela média. Se a fonte produz 1.200/s e o consumidor 800/s, um buffer de 1.000 leva 2,5 segundos para encher. Isso é suficiente? Só se a rajada durar menos que isso. Caso contrário, o buffer é apenas um atraso até a falha.

Use a Lei de Little para traduzir ritmo em memória: `itens no sistema ≈ taxa × tempo de permanência`. Depois multiplique pelo tamanho do item e pelo número de pipelines. Monitore profundidade da fila, tempo de espera e contagem de descartes; alarme em 80% do teto, não quando o OOM chega.

Controle também a concorrência. `flatMap` do Reactor tem concorrência padrão 256; `flatMap(mapper, 8)` limita chamadas simultâneas. `limitRate(100)` pede em lotes e reduz o volume em voo. Prefetch alto aumenta throughput e memória na mesma proporção.

## Armadilhas comuns

- Usar `onBackpressureBuffer()` sem limite e chamar isso de resiliência.
- Colocar o buffer depois do ponto lento, quando o dano já aconteceu.
- Descartar eventos críticos com `drop` porque “a fila estava cheia”.
- Manter uma fila por conexão sem teto; sob carga, todas crescem juntas.
- Confundir commit de offset com processamento concluído e liberar o broker cedo demais.
- Abrir `flatMap` sem limite de concorrência e multiplicar chamadas à dependência lenta.
- Não medir descartes: o sistema perde dados em silêncio.

## Checklist de domínio

- [ ] Explico a diferença entre buffer, drop, latest e error.
- [ ] Sei calcular o tamanho do buffer a partir de taxa, rajada e memória.
- [ ] Meu buffer é limitado e tem política explícita ao encher.
- [ ] Monitoro profundidade, espera e descartes.
- [ ] Limito concorrência e prefetch em operadores como `flatMap`.
- [ ] Sei quando a única saída é rejeitar carga ou escalar o consumidor.

## Para ir além

Leia a documentação de `onBackpressureBuffer` no Reactor e o guia de controle de demanda da Mutiny. Depois reproduza uma fonte 10× mais rápida que o consumidor com buffer limitado e observe a métrica de descarte antes do OOM — e teste o mesmo cenário com buffer ilimitado para ver a diferença.

- [Reactor — Flux.onBackpressureBuffer](https://projectreactor.io/docs/core/release/api/reactor/core/publisher/Flux.html#onBackpressureBuffer-int-)
- [Mutiny — controlling demand](https://smallrye.io/smallrye-mutiny/2.9.3/guides/controlling-demand/)
- [Reactor — referência de operadores](https://projectreactor.io/docs/core/release/reference/apdx-operatorChoice.html)
