> **Em uma frase:** transação não conserta modelagem — faça a invariante caber em um documento e reserve transações para o que realmente cruza documentos.

## O problema

O time separa pedido e itens em duas coleções. Para manter o total consistente, envolve cada escrita em uma transação multi-documento. Funciona no início; depois aparecem conflitos de escrita, transações de 40 segundos e picos de latência.

O outro extremo é o array sem limite: cada evento é um `$push` no mesmo documento. O documento chega perto dos 16 MB, cada atualização reescreve e a replicação sofre. A raiz é a mesma: a fronteira do agregado foi ignorada.

## Como funciona

**Padrões de modelagem** resolvem o formato antes de a transação entrar em cena:

| Padrão | Problema que resolve | Como |
|---|---|---|
| Bucket | série/eventos crescem sem limite | agrupa N amostras ou uma janela de tempo |
| Outlier | poucos documentos são gigantes | caso raro vai para coleção separada com flag |
| Subset | histórico enorme, acesso só ao recente | últimos N embutidos, resto em outra coleção |
| Computed | agregação repetida e cara | total/contador pré-calculados e atualizados junto |
| Extended reference | join frequente por poucos campos | copia nome/preço para evitar `$lookup` |

**Bucket** é o padrão para séries temporais. Em vez de um documento por leitura, você grava um documento por sensor/hora com `count`, `soma` e um array de amostras limitado. Consultas por intervalo leem poucos buckets; o documento tem tamanho previsível. O trade-off é que ler uma amostra específica exige `$unwind`. Coleções time-series nativas aplicam bucket internamente, mas o padrão manual ainda ajuda quando você controla o formato.

**Outlier** evita que 0,1% dos casos dite o modelo. O documento normal embute os itens; o pedido com 5 mil itens ganha `hasOutlier: true` e os itens vão para outra coleção. A aplicação verifica a flag e faz uma segunda leitura só nesse caso.

**Computed** é a duplicação consciente: o total do pedido é atualizado com `$inc` na mesma operação que insere o item. Se o valor puder divergir, um job de reconciliação recalcula. Cada campo derivado é uma invariante a manter.

**Transações** existem em replica sets e clusters sharded. Elas oferecem snapshot isolation e atomicidade multi-documento, com custo: locks mantidos até o commit, entradas no oplog e limite padrão de 60 segundos (`transactionLifetimeLimitSeconds`). Uma transação que altera documentos demais pode estourar o limite de 16 MB de entrada no oplog.

```java
package com.exemplo.banco;

import com.mongodb.ReadConcern;
import com.mongodb.WriteConcern;
import com.mongodb.client.ClientSession;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.TransactionOptions;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Updates;
import com.mongodb.client.result.UpdateResult;
import java.math.BigDecimal;
import org.bson.Document;
import org.bson.types.Decimal128;

public final class TransferenciaService {

    private final MongoClient client;
    private final MongoCollection<Document> contas;

    public TransferenciaService(MongoClient client) {
        this.client = client;
        this.contas = client.getDatabase("banco").getCollection("contas");
    }

    public void transferir(String origem, String destino, BigDecimal valor) {
        if (valor.signum() <= 0) {
            throw new IllegalArgumentException("Valor deve ser positivo");
        }

        TransactionOptions opcoes = TransactionOptions.builder()
                .readConcern(ReadConcern.SNAPSHOT)
                .writeConcern(WriteConcern.MAJORITY)
                .build();

        try (ClientSession session = client.startSession()) {
            // withTransaction repete a transação em erros transitórios e o commit incerto.
            session.withTransaction(() -> {
                UpdateResult debitou = contas.updateOne(session,
                        Filters.and(
                                Filters.eq("_id", origem),
                                Filters.gte("saldo", new Decimal128(valor))),
                        Updates.inc("saldo", new Decimal128(valor.negate())));

                if (debitou.getModifiedCount() != 1) {
                    throw new IllegalStateException("Saldo insuficiente");
                }

                contas.updateOne(session,
                        Filters.eq("_id", destino),
                        Updates.inc("saldo", new Decimal128(valor)));
                return null;
            }, opcoes);
        }
    }
}
```

Dentro da transação, nada de HTTP, fila ou cálculo longo. Para efeitos externos, use outbox: grava o evento na mesma transação e um worker publica depois.

```java
package com.exemplo.telemetria;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.UpdateOptions;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;
import org.bson.Document;

public final class LeituraRepository {

    private static final int MAX_AMOSTRAS = 240;
    private final MongoCollection<Document> leituras;

    public LeituraRepository(MongoCollection<Document> leituras) {
        this.leituras = leituras;
    }

    // Bucket por sensor/hora: documento limitado, escrita previsível.
    public void registrar(String sensorId, Instant momento, double temperatura) {
        Instant inicioHora = momento.truncatedTo(ChronoUnit.HOURS);
        String bucketId = sensorId + ":" + inicioHora;

        Document amostra = new Document("t", Date.from(momento)).append("v", temperatura);
        Document update = new Document("$setOnInsert",
                new Document("sensorId", sensorId).append("inicio", Date.from(inicioHora)))
                .append("$inc", new Document("count", 1).append("soma", temperatura))
                .append("$push", new Document("amostras", new Document("$each", List.of(amostra))
                        .append("$slice", -MAX_AMOSTRAS)));

        leituras.updateOne(Filters.eq("_id", bucketId), update, new UpdateOptions().upsert(true));
    }
}
```

## Na prática

Transações brilham quando a invariante realmente cruza documentos: transferência entre contas, baixa de estoque em dois depósitos, reserva que atualiza pedido e inventário. Mesmo aí, use filtros condicionais (`saldo >= valor`) dentro da transação; ler e validar antes abre janela para concorrência.

Fora esses casos, modele para atomicidade de documento: pedido com itens embutidos não precisa de transação para inserir, e contador não precisa para `$inc`. Transação vira exceção documentada.

`withTransaction` não é mágica: ele repete o corpo em `TransientTransactionError` e tenta o commit novamente em `UnknownTransactionCommitResult`. Se o corpo tem efeito colateral não idempotente, você duplica o efeito. Mantenha o corpo restrito ao banco ou use chave de idempotência.

## Armadilhas comuns

- **Transação em toda escrita.** Custo de locks e oplog sem necessidade. Embuta primeiro.
- **Transação longa.** Limite de 60 segundos e locks segurados; quebre ou repense.
- **HTTP ou mensageria dentro da transação.** Latência externa segura locks. Use outbox.
- **`$push` sem `$slice`.** O array cresce até o teto de 16 MB e cada update fica caro.
- **Bucket grande demais.** O documento inteiro é reescrito; mantenha-o na casa das centenas de KB.
- **Outlier esquecido.** A flag existe, mas nenhuma query verifica; os itens somem do relatório.
- **Ignorar `WriteConflict`.** É transitório e deve ser repetido, não tratado como erro de negócio.

## Checklist de domínio

- [ ] Você decide embed antes de considerar transação
- [ ] Você aplica bucket, outlier, subset e computed com critério
- [ ] Você delimita transações curtas e sem efeitos externos
- [ ] Você usa `withTransaction` e entende os retries
- [ ] Você reconhece o limite de 60 segundos e de 16 MB no oplog
- [ ] Você mantém invariantes com filtros condicionais, não com leitura prévia

## Para ir além

- [MongoDB — Transactions](https://www.mongodb.com/docs/manual/core/transactions/)
- [MongoDB — Building with Patterns](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/)
- [MongoDB — Time Series Collections](https://www.mongodb.com/docs/manual/core/timeseries-collections/)
