> **Em uma frase:** o driver Java não esconde o banco — filtros, projeções e updates atômicos são o contrato, e o custo de cada chamada aparece no cursor.

## O problema

O tutorial mostra `mongoCollection.find().first()` e um `replaceOne` depois de ler o documento. Funciona com dez registros. Em produção, o time descobre que cria um `MongoClient` por requisição e esgota o pool, que dois workers perdem atualizações ao ler-modificar-gravar, e que `skip(100000).limit(20)` leva segundos porque o servidor percorre e descarta 100 mil documentos.

O driver não é um ORM. Ele entrega o BSON quase cru: você decide o filtro, os campos que voltam, o operador de update e o momento de fechar o cursor. Essa transparência é a graça — e a responsabilidade.

## Como funciona

**Conexão.** `MongoClient` é thread-safe e mantém um pool. Crie um por aplicação, reutilize e feche no shutdown. O `MongoClientSettings` permite configurar pool, timeouts, write concern e read preference.

**Documento.** `Document` é um `Map` ordenado. `getInteger`, `getString` e `getDate` não convertem tipos: se o campo veio como `Long`, `getInteger` devolve `null`. Use `Number` quando o tipo pode variar e prefira `_id` com valor gerado na aplicação (UUID/String) quando a idempotência importa.

**Filtros.** `Filters` compõe expressões: `and`, `or`, `eq`, `in`, `gte`, `exists`, `regex`. O filtro é serializado e enviado ao servidor; não existe query planner no cliente. Um filtro que não usa índice varre a coleção, não importa quão elegante seja o Java.

**Projeção.** `Projections.include("nome", "preco")` reduz rede e memória. `_id` volta por padrão; para excluí-lo, use `Projections.excludeId()` junto com os campos incluídos. Não misture inclusão e exclusão no mesmo objeto, exceto para `_id`. Quando todos os campos estão no índice, o MongoDB faz covered query e nem toca nos documentos.

**Escrita.** `insertOne`/`insertMany` para criar; `updateOne` com `$set`, `$inc`, `$push`, `$addToSet` para alterar; `findOneAndUpdate` quando você precisa do valor anterior ou posterior de forma atômica. `replaceOne` troca o documento inteiro: campos omitidos desaparecem. `UpdateResult.getMatchedCount()` diz quantos casaram; `getModifiedCount()` quantos realmente mudaram.

```java
package com.exemplo.loja;

import com.mongodb.MongoWriteException;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.FindOneAndUpdateOptions;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import com.mongodb.client.model.Projections;
import com.mongodb.client.model.ReturnDocument;
import com.mongodb.client.model.Updates;
import java.util.Optional;
import org.bson.Document;

public final class ProdutoRepository implements AutoCloseable {

    private final MongoClient client;
    private final MongoCollection<Document> produtos;

    public ProdutoRepository(String uri) {
        this.client = MongoClients.create(uri); // um client por aplicação, não por request
        this.produtos = client.getDatabase("loja").getCollection("produtos");
        produtos.createIndex(
                Indexes.compoundIndex(Indexes.ascending("categoria"), Indexes.descending("preco")),
                new IndexOptions().name("categoria_preco"));
    }

    public void inserir(Document produto) {
        try {
            produtos.insertOne(produto);
        } catch (MongoWriteException e) {
            if (e.getError().getCode() == 11000) {
                throw new IllegalStateException("SKU duplicado: " + produto.getString("sku"), e);
            }
            throw e;
        }
    }

    public Optional<Document> buscarResumo(String sku) {
        return Optional.ofNullable(produtos.find(Filters.eq("sku", sku))
                .projection(Projections.include("nome", "preco", "estoque"))
                .first());
    }

    // $inc é atômico no servidor; o filtro impede estoque negativo.
    public Document reservarEstoque(String sku, int quantidade) {
        Document atualizado = produtos.findOneAndUpdate(
                Filters.and(Filters.eq("sku", sku), Filters.gte("estoque", quantidade)),
                Updates.inc("estoque", -quantidade),
                new FindOneAndUpdateOptions().returnDocument(ReturnDocument.AFTER));
        if (atualizado == null) {
            throw new IllegalStateException("Estoque insuficiente para " + sku);
        }
        return atualizado;
    }

    @Override
    public void close() {
        client.close();
    }
}
```

**Paginação.** `skip(n)` é O(n): o servidor produz e descarta os documentos anteriores. Keyset pagination usa o último valor indexado como âncora e transforma a página em uma busca de índice. A tupla de ordenação precisa ser única; inclua `_id` para desempatar.

```java
package com.exemplo.loja;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoCursor;
import com.mongodb.client.model.BulkWriteOptions;
import com.mongodb.client.model.DeleteOneModel;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Sorts;
import com.mongodb.client.model.UpdateOneModel;
import com.mongodb.client.model.Updates;
import com.mongodb.client.model.WriteModel;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import org.bson.Document;
import org.bson.conversions.Bson;

public final class PedidoRepository {

    private final MongoCollection<Document> pedidos;

    public PedidoRepository(MongoCollection<Document> pedidos) {
        this.pedidos = pedidos;
    }

    // Keyset pagination: o índice (tenantId, criadoEm, _id) sustenta filtro e sort.
    public List<Document> pagina(String tenantId, Instant ultimoTempo, String ultimoId, int tamanho) {
        Bson filtro = ultimoTempo == null
                ? Filters.eq("tenantId", tenantId)
                : Filters.and(
                        Filters.eq("tenantId", tenantId),
                        Filters.or(
                                Filters.lt("criadoEm", Date.from(ultimoTempo)),
                                Filters.and(
                                        Filters.eq("criadoEm", Date.from(ultimoTempo)),
                                        Filters.lt("_id", ultimoId))));

        List<Document> out = new ArrayList<>(tamanho);
        try (MongoCursor<Document> cursor = pedidos.find(filtro)
                .sort(Sorts.orderBy(Sorts.descending("criadoEm"), Sorts.descending("_id")))
                .limit(tamanho)
                .iterator()) {
            cursor.forEachRemaining(out::add);
        }
        return out;
    }

    public void fecharLote(List<String> ids) {
        List<WriteModel<Document>> ops = new ArrayList<>(ids.size() + 1);
        for (String id : ids) {
            ops.add(new UpdateOneModel<>(
                    Filters.eq("_id", id),
                    Updates.combine(
                            Updates.set("status", "FECHADO"),
                            Updates.currentDate("fechadoEm"))));
        }
        ops.add(new DeleteOneModel<>(Filters.eq("status", "RASCUNHO")));
        pedidos.bulkWrite(ops, new BulkWriteOptions().ordered(false));
    }
}
```

## Na prática

Meça a query, não o Java. Ative o log de comandos do driver em desenvolvimento (`logging.level.org.mongodb.driver=DEBUG` via SLF4J), olhe `docsExamined` e `nReturned`. Uma busca por `sku` sem índice único é uma varredura; um sort sem índice estoura o limite de 32 MB de memória do servidor e falha.

Use `findOneAndUpdate` para reservas, contadores e transições de estado. Use `bulkWrite` para lotes: `ordered(false)` continua após um erro e devolve os erros individuais; `ordered(true)` para no primeiro. Para leitura de relatório, configure `ReadPreference.secondaryPreferred()` na coleção e aceite dado levemente atrasado.

## Armadilhas comuns

- **Criar `MongoClient` por request.** Cada instância abre sockets e threads. Um singleton resolve.
- **Ler, calcular e gravar com `$set`.** Dois workers perdem atualização. `$inc` ou filtro condicional com `findOneAndUpdate`.
- **`skip` profundo.** O servidor anda até o offset. Keyset pagination.
- **`replaceOne` com DTO parcial.** Campos ausentes são apagados. `$set` explícito.
- **Misturar inclusão e exclusão na projeção.** Erro de servidor; só `_id` é exceção.
- **`find()` sem limite.** Um endpoint de listagem pode retornar a coleção inteira. Sempre limite ou pagine.
- **Comparar `ObjectId` com `String`.** O filtro não casa e volta vazio. Converta com `new ObjectId(texto)`.
- **Ignorar erro 11000.** Duplicidade é regra de negócio, não falha genérica.

## Checklist de domínio

- [ ] Você mantém um `MongoClient` por aplicação e o fecha no shutdown
- [ ] Você escreve filtros compostos e projeções sem consultar o tutorial
- [ ] Você escolhe `$inc`, `$set` ou `findOneAndUpdate` conforme a invariante
- [ ] Você pagina por keyset e explica por que `skip` profundo é caro
- [ ] Você trata duplicidade e erros de escrita com contexto
- [ ] Você fecha cursores e limita toda listagem

## Para ir além

- [MongoDB Java Sync Driver — Quick Start](https://www.mongodb.com/docs/drivers/java/sync/current/get-started/)
- [MongoDB — Query Documents](https://www.mongodb.com/docs/manual/tutorial/query-documents/)
- [MongoDB — Update Documents](https://www.mongodb.com/docs/manual/tutorial/update-documents/)
