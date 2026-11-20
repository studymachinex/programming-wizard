> **Em uma frase:** streaming de verdade é processar com memória constante; se o pipeline precisa carregar tudo para começar, o `Multi` é apenas decoração.

Ler 20 milhões de linhas, transformar e gravar não cabe em `List`. O pipeline precisa puxar, processar e confirmar em blocos, mantendo a pressão de volta sobre a fonte. Mutiny faz isso com `Multi`, `group().intoLists().of(n)` e operadores que assinam uma operação assíncrona por item — desde que você limite a concorrência.

## O problema

O primeiro instinto é `multi.collect().asList()` para depois iterar. Em um arquivo de 8 GB, isso tenta materializar tudo antes do primeiro insert: memória explode e o tempo até o primeiro efeito é o tempo total de leitura. Em um stream infinito, nunca retorna.

O segundo problema é concorrência sem limite. `flatMap` (ou `transformToUniAndMerge`) assina todos os publishers internos que a demanda permitir. Se a fonte entrega 10 mil itens de uma vez, você abre 10 mil inserts concorrentes, esgota o pool de conexões e transforma throughput em fila de espera. Concorrência precisa ser declarada.

## Como funciona

| Fonte | Como produz | Backpressure |
|---|---|---|
| Arquivo | `Files.lines` / `BufferedReader` | Pull: cada linha é lida sob demanda |
| Banco | Páginas por keyset (`WHERE id > :ultimo LIMIT n`) | Limitada pelo tamanho da página |
| Fila | `Multi` do connector | Respeita demanda do consumidor |
| HTTP | Chunks do cliente reativo | Respeita a demanda, se o cliente suportar |

`group().intoLists().of(n)` acumula até `n` itens e emite uma `List`. Ele pede `n` itens à montante, então a memória fica limitada a um lote — mais o que a fonte já prefetchou. Não confunda com `collect().asList()`, que espera o fim e devolve tudo.

Para o processamento assíncrono de cada item existem dois operadores opostos:

| Operador | Ordem | Concorrência | Quando usar |
|---|---|---|---|
| `transformToUniAndConcatenate` | Preservada | 1 por vez | Checkpoint, escrita ordenada, menos pressão |
| `transformToUniAndMerge` | Perdida | Limitada por `capDemandsTo(n)` | I/O independente, throughput maior |

`transformToUniAndMerge` sem `capDemandsTo` usa a demanda disponível. `capDemandsTo(4)` reduz essa demanda e, na prática, limita quantos `Uni` internos ficam em voo. É o equivalente controlado do `flatMap` com concorrência.

## Na prática

Ingestão de arquivo em lotes, com checkpoint na mesma transação do lote:

```java
package com.exemplo.ingestao;

import io.quarkus.hibernate.reactive.panache.Panache;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.Uni;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

public class ImportadorLancamentos {

    public Uni<Long> importar(Path arquivo) {
        return Multi.createFrom().resource(
                () -> Files.lines(arquivo, StandardCharsets.UTF_8),
                linhas -> Multi.createFrom().iterable(() -> linhas.iterator()))
            .withFinalizer(Stream::close)
            .group().intoLists().of(500)
            .onItem().transformToUniAndConcatenate(this::gravarLote)
            .collect().last()
            .map(ultimo -> ultimo == null ? 0L : ultimo);
    }

    private Uni<Long> gravarLote(List<String> linhas) {
        List<Lancamento> lote = new ArrayList<>(linhas.size());
        long maiorId = 0L;
        for (String linha : linhas) {
            Lancamento lancamento = Lancamento.parse(linha);
            lote.add(lancamento);
            maiorId = Math.max(maiorId, lancamento.id());
        }
        long checkpoint = maiorId;

        return Panache.withTransaction(() ->
                Lancamento.persist(lote)
                    .chain(() -> Checkpoint.atualizar("lancamentos", checkpoint)))
            .replaceWith(checkpoint);
    }
}
```

O `resource` garante o `close` do `Stream` mesmo em falha ou cancelamento. O lote tem no máximo 500 itens; o checkpoint é gravado na mesma transação dos dados. Se o processo morrer depois do commit, a próxima execução começa em `id > checkpoint` sem duplicar o lote. Se morrer antes, o lote inteiro é reprocessado — por isso o insert precisa ser idempotente (upsert ou chave natural).

Quando os itens são independentes e a ordem não importa, troque a concorrência:

```java
@Inject
@Channel("lancamentos")
Multi<Lancamento> fila;

public Uni<Void> processar() {
    return fila
        .capDemandsTo(4)
        .onItem().transformToUniAndMerge(this::processarUm)
        .collect().last()
        .replaceWithVoid();
}
```

Com merge, não use um checkpoint único: o lote 7 pode commitar antes do lote 6, e um checkpoint baseado no último commit declararia como processado algo que ainda não terminou. Nesse caso, controle por chave, use um watermark por partição ou volte para `concatenate`.

## Armadilhas comuns

- `collect().asList()` em arquivo grande ou stream infinito.
- `transformToUniAndMerge` sem `capDemandsTo`: milhares de operações em voo.
- Lote grande demais: transação longa, locks, memória e timeout de commit.
- Lote pequeno demais: uma ida ao banco por linha, throughput baixo.
- Checkpoint fora da transação do lote: buraco entre dado e progresso.
- Guardar o `Stream` de `Files.lines` sem fechar: descritor vazando.
- Ignorar o custo de `Panache.withTransaction` por item quando o lote já é uma unidade.

## Checklist de domínio

- [ ] Meu pipeline processa com memória limitada pelo tamanho do lote.
- [ ] Sei a diferença entre concatenate e merge em ordem e concorrência.
- [ ] Limito a concorrência com `capDemandsTo` e explico o número escolhido.
- [ ] O checkpoint é atômico com o efeito e sobrevive a reinício.
- [ ] Sei retomar de onde parei sem reprocessar tudo.
- [ ] Meço throughput, tamanho do lote e tempo de commit.

## Para ir além

Leia o tutorial de criação de pipelines do Mutiny e o guia de Hibernate Reactive. Depois rode a mesma ingestão com lote de 50 e de 5.000 e compare throughput, memória e tempo de commit.

- [Mutiny — Creating Multi pipelines](https://smallrye.io/smallrye-mutiny/2.9.5/tutorials/creating-multi-pipelines/)
- [Quarkus — Hibernate Reactive with Panache](https://quarkus.io/guides/hibernate-reactive)
- [Quarkus — Mutiny primer](https://quarkus.io/guides/mutiny-primer)
