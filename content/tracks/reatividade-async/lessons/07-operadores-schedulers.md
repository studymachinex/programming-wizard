> **Em uma frase:** o operador define ordem e concorrência; o scheduler define em qual thread o trabalho acontece — escolher um sem o outro é como definir o destino sem saber quem dirige.

Um pipeline reativo é uma receita montada na construção e executada na assinatura. `map`, `flatMap`, `concatMap`, `merge` e `zip` parecem variações do mesmo verbo, mas produzem garantias diferentes de ordem, paralelismo e uso de memória. `publishOn` e `subscribeOn` completam a história: eles dizem onde cada pedaço roda.

## O problema

Um endpoint reativo busca IDs de produtos e, para cada um, consulta o banco com JDBC. O código usa `map(id -> repo.buscar(id))` e roda tudo no event loop: a primeira consulta bloqueia, o detector dispara e todas as conexões daquele loop param. O time troca para `flatMap` sem limite, melhora o throughput em teste e derruba o banco em produção com centenas de conexões simultâneas.

Em outro ponto, o time coloca `subscribeOn(boundedElastic())` no fim da cadeia esperando mover o processamento, mas o operador só afeta a assinatura da fonte. O trabalho pesado continua onde estava.

## Como funciona

`Flux` representa 0..N itens; `Mono`, 0..1. Ambos são lazies: montar a cadeia não executa nada; a execução começa no `subscribe`. Cada operador assina o anterior e devolve um novo publisher.

- `map` transforma 1:1, de forma síncrona. É para cálculo barato; se a função bloqueia, ela bloqueia a thread do operador.
- `flatMap` assina vários publishers internos ao mesmo tempo e intercala os resultados. A ordem não é garantida; a concorrência é limitada pelo parâmetro (padrão 256).
- `concatMap` assina um interno por vez e preserva a ordem. Menos paralelismo, mais previsibilidade.
- `merge` combina fontes independentes, intercalando os itens conforme chegam.
- `zip` combina por índice, esperando o item correspondente de cada fonte.

O pipeline abaixo tira o JDBC do event loop e limita a concorrência. O `subscribeOn` fica no `Mono` interno, porque é ele que representa o trabalho bloqueante:

```java
package br.com.loja.catalogo;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

public final class CatalogoReativo {

    public Flux<ProdutoView> views(java.util.List<Long> ids) {
        return Flux.fromIterable(ids)
            .flatMap(id -> Mono.fromCallable(() -> repo.buscar(id))
                .subscribeOn(Schedulers.boundedElastic()), 8)
            .map(this::toView); // transformação barata: fica na thread atual
    }
}
```

`Mono.fromCallable` adia a chamada até a assinatura e captura a exceção no fluxo. `subscribeOn(boundedElastic())` move a assinatura — e portanto a chamada bloqueante — para o pool elástico. `flatMap(..., 8)` permite no máximo oito consultas simultâneas, em vez de 256.

Para juntar respostas independentes, `zip` espera todas e entrega uma tupla. Para preservar a ordem de emissão de notas fiscais, `concatMap` é a escolha:

```java
public Mono<Resumo> resumo(long id) {
    var preco = Mono.fromCallable(() -> precos.atual(id))
        .subscribeOn(Schedulers.boundedElastic());
    var estoque = Mono.fromCallable(() -> estoque.disponivel(id))
        .subscribeOn(Schedulers.boundedElastic());

    return Mono.zip(preco, estoque)
        .map(t -> new Resumo(t.getT1(), t.getT2()));
}

public Flux<Recibo> emitir(java.util.List<Pedido> pedidos) {
    return Flux.fromIterable(pedidos)
        .concatMap(p -> Mono.fromCallable(() -> fiscal.emitir(p))
            .subscribeOn(Schedulers.boundedElastic()));
}
```

`publishOn` muda a thread dos operadores **seguintes**, a partir do ponto onde aparece. `subscribeOn` muda a thread da assinatura e da fonte, independentemente da posição na cadeia — mas não move o trabalho de publishers internos. Vários `subscribeOn` não empilham: o mais próximo da fonte vence.

`parallel()` divide o fluxo em rails (por padrão, um por núcleo), mas não paraleliza sozinho: é `ParallelFlux.runOn(scheduler)` que define onde cada rail executa. Use `parallel().runOn(Schedulers.parallel())` para CPU e volte com `sequential()` antes de operadores que exigem um único fluxo; para I/O, prefira `flatMap` com `subscribeOn(boundedElastic)` e concorrência limitada.

| Operador | Ordem | Concorrência | Memória | Use quando |
|---|---|---|---|---|
| `map` | Preserva | Nenhuma | Baixa | Transformação síncrona e barata |
| `flatMap` | Não garante | Até o limite configurado | Proporcional ao prefetch | I/O independente com throughput |
| `concatMap` | Preserva | 1 | Baixa | Ordem obrigatória |
| `merge` | Intercala fontes | Todas as fontes | Soma dos buffers | Juntar fluxos independentes |
| `zip` | Combina por índice | Uma de cada fonte | Uma tupla por par | Montar resposta com N fontes |

## Na prática

`Schedulers.parallel()` é para CPU: usa o número de núcleos e não deve receber I/O bloqueante. `Schedulers.boundedElastic()` é para bloqueio: por padrão, até 10× o número de núcleos e uma fila de 100.000 tarefas. `Schedulers.single()` atende trabalho serializado; `Schedulers.fromExecutor` permite plugar um pool próprio com nome e limites.

Coloque `publishOn(boundedElastic())` imediatamente antes do trecho bloqueante. Se o `publishOn` vier depois da chamada JDBC, ele não protege nada: o dano já ocorreu na thread anterior. Prefira `Mono.fromCallable(...).subscribeOn(...)` para isolar a chamada e `publishOn` para o processamento seguinte.

`Flux.runOn(scheduler)` é um atalho que aplica o scheduler à assinatura e à emissão da cadeia inteira. Funciona bem para pipelines homogêneos, mas dificulta saber qual trecho mudou de thread; em código novo, prefira `publishOn` e `subscribeOn` explícitos e deixe `runOn` para os casos simples.

Ajuste concorrência e prefetch juntos. `flatMap(mapper, 8)` limita chamadas em voo; `publishOn(scheduler, 64)` controla quantos itens são pedidos ao montante. Prefetch alto melhora throughput e aumenta memória; meça os dois.

Contexto não atravessa scheduler automaticamente. MDC, `ThreadLocal` e tracing precisam de propagação explícita ou de uma biblioteca que copie o contexto. Em teste, use `StepVerifier` para verificar a sequência de sinais e `StepVerifier.withVirtualTime` para timeout sem esperar de verdade.

## Armadilhas comuns

- Rodar JDBC em `Schedulers.parallel()` e achar que o problema é o driver.
- Usar `map` para I/O e bloquear a thread que só deveria transformar.
- Colocar `subscribeOn` no fim da cadeia esperando mover os operadores seguintes.
- Deixar `flatMap` sem limite de concorrência e abrir centenas de conexões.
- Usar `concatMap` quando a ordem não importa e perder throughput sem motivo.
- Esquecer o segundo argumento de `subscribe` e perder falhas silenciosamente.
- Compartilhar estado mutável entre itens que rodam em threads diferentes.

## Checklist de domínio

- [ ] Escolho `flatMap`, `concatMap`, `merge` ou `zip` pela garantia que preciso.
- [ ] Sei que `publishOn` afeta o downstream e `subscribeOn`, a fonte.
- [ ] Movo I/O bloqueante para `boundedElastic` com concorrência limitada.
- [ ] Não uso `parallel()` para trabalho bloqueante.
- [ ] Ajusto prefetch e concorrência com base em memória e latência.
- [ ] Propago contexto de log/tracing entre schedulers.

## Para ir além

Leia a seção de schedulers e o guia de escolha de operadores do Reactor. Depois pegue um pipeline que roda no event loop, mova o I/O para `boundedElastic`, limite o `flatMap` e compare p99, conexões abertas e uso de CPU.

- [Reactor — schedulers](https://projectreactor.io/docs/core/release/reference/coreFeatures/schedulers.html)
- [Reactor — escolha de operadores](https://projectreactor.io/docs/core/release/reference/apdx-operatorChoice.html)
- [Reactor — Flux API](https://projectreactor.io/docs/core/release/api/reactor/core/publisher/Flux.html)
