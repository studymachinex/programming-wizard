> **Em uma frase:** escolher MongoDB é escolher qual agregado cabe em um documento — e pagar, de forma consciente, o preço de resolver o resto na aplicação.

## O problema

O time migra o catálogo de um banco relacional para MongoDB porque "schema flexível acelera o desenvolvimento". Seis meses depois, o documento de pedido tem 40 campos opcionais, cada tela dispara três consultas e junta os resultados em Java, e o relatório financeiro precisa de `$lookup` sobre dois milhões de documentos. O banco não falhou: a decisão foi tomada por moda, sem olhar para o padrão de acesso.

No relacional, o join é uma operação de primeira classe e o schema é imposto pelo banco. No documento, a unidade de leitura e de atomicidade é o agregado. Quem não sabe qual é o agregado cria uma tabela com sintaxe JSON — e paga caro.

## Como funciona

Um documento é lido e gravado inteiro. Isso define quase todas as decisões:

| Critério | Embutir | Referenciar |
|---|---|---|
| Acesso | pai e filho sempre juntos | filho consultado sozinho |
| Cardinalidade | 1:1 ou 1:poucos, com limite | 1:muitos sem limite |
| Escrita | filho muda junto com o pai | filho compartilhado ou atualizado |
| Tamanho | documento final abaixo de 16 MB | filho grande ou cresce sem parar |
| Atomicidade | invariante cabe no documento | invariante cruza documentos |

Embutir não é "denormalizar por preguiça"; é reconhecer que o filho pertence ao pai. Itens de pedido são o exemplo canônico: total, desconto e itens precisam ser consistentes no momento da compra. Se o item vive em outra coleção, toda leitura de pedido vira um join e toda alteração exige transação.

Referenciar é correto quando o filho tem vida própria. Cliente existe antes do pedido, é compartilhado por milhares e muda de endereço sem que o pedido histórico mude. Aí você referencia e decide se o pedido guarda uma cópia do nome e do endereço (snapshot) ou se busca o valor atual na leitura.

Cardinalidade é o limite prático. Array com dez itens: embuta. Array com dez mil eventos: não. Cada update que aumenta um array reescreve o documento e replica mais bytes. Para séries, use bucket pattern.

Atomicidade é o outro limite. O MongoDB garante atomicidade em um único documento. Transações multi-documento existem, mas custam locks, snapshot e oplog maior. Se a invariante é "pedido + itens", embutir é mais barato que abrir transação.

```java
package com.exemplo.catalogo;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoCollection;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import org.bson.Document;
import org.bson.types.Decimal128;

public final class PedidoRepository {

    private final MongoCollection<Document> pedidos;

    public PedidoRepository(MongoClient client) {
        this.pedidos = client.getDatabase("loja").getCollection("pedidos");
    }

    // Itens embutidos: o pedido é o agregado e o total é derivado deles.
    public void inserir(String pedidoId, String clienteId, List<Item> itens) {
        BigDecimal total = itens.stream()
                .map(i -> i.preco().multiply(BigDecimal.valueOf(i.quantidade())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Document doc = new Document("_id", pedidoId)
                .append("clienteId", clienteId) // referência: cliente tem vida própria
                .append("status", "CRIADO")
                .append("criadoEm", Date.from(Instant.now()))
                .append("total", new Decimal128(total))
                .append("itens", itens.stream().map(Item::toDocument).toList());

        pedidos.insertOne(doc);
    }

    public record Item(String sku, int quantidade, BigDecimal preco) {
        Document toDocument() {
            return new Document("sku", sku)
                    .append("quantidade", quantidade)
                    .append("preco", new Decimal128(preco));
        }
    }
}
```

Com o filho compartilhado, o join vira uma segunda consulta em lote: duas queries, não uma por pedido.

```java
package com.exemplo.catalogo;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoCursor;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Projections;
import com.mongodb.client.model.Sorts;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.bson.Document;

public final class PedidoQuery {

    private final MongoCollection<Document> pedidos;
    private final MongoCollection<Document> clientes;

    public PedidoQuery(MongoCollection<Document> pedidos, MongoCollection<Document> clientes) {
        this.pedidos = pedidos;
        this.clientes = clientes;
    }

    // Duas queries no total, independentemente do tamanho da página.
    public List<Document> ultimosComCliente(int limite) {
        List<Document> pagina = new ArrayList<>();
        try (MongoCursor<Document> cursor = pedidos.find()
                .projection(Projections.include("clienteId", "total", "criadoEm"))
                .sort(Sorts.descending("criadoEm"))
                .limit(limite)
                .iterator()) {
            cursor.forEachRemaining(pagina::add);
        }

        List<String> ids = pagina.stream()
                .map(d -> d.getString("clienteId"))
                .distinct()
                .toList();

        Map<String, String> nomes = new HashMap<>();
        try (MongoCursor<Document> cursor = clientes.find(Filters.in("_id", ids))
                .projection(Projections.include("nome"))
                .iterator()) {
            cursor.forEachRemaining(c -> nomes.put(c.getString("_id"), c.getString("nome")));
        }

        pagina.forEach(p -> p.append("clienteNome", nomes.get(p.getString("clienteId"))));
        return pagina;
    }
}
```

## Na prática

MongoDB brilha quando o agregado é claro: catálogo com atributos variáveis por categoria, perfil de usuário, conteúdo, telemetria, pedido com itens. Ele é uma escolha ruim quando cada tela exige um join diferente e relatórios cruzam cinco entidades; contabilidade, ERP e faturamento pedem relacional.

"Schema flexível" não significa ausência de schema. Valide com `$jsonSchema`, versione documentos com `schemaVersion` e faça migração em background. Schema caótico é pior que schema rígido porque o erro aparece no cliente, não no deploy.

Quando referencia, decida explicitamente entre snapshot e valor atual. Fatura guarda o preço e o endereço do momento; tela de perfil mostra o dado de agora. Misturar os dois sem documentar produz relatório errado.

## Armadilhas comuns

- **Array sem limite.** Comentários dentro do post parecem elegantes até o post viral. Separe em coleção ou use bucket pattern.
- **`$lookup` em todo read path.** `$lookup` não é join gratuito: ele roda por documento de entrada e precisa de índice na coleção estrangeira.
- **Transação como desculpa para model ruim.** Transação multi-documento tem custo e limite de tempo; não transforme o MongoDB em um relacional pior.
- **Schema sem validação.** Campo com três nomes e dois tipos vira pesadelo de consulta. Valide na escrita.
- **Dinheiro como `double`.** Use `Decimal128`/`BigDecimal`; arredondamento binário não combina com fatura.
- **Referência sem índice.** `$in` e `$lookup` sem índice varrem a coleção inteira e derrubam a latência.

## Checklist de domínio

- [ ] Você identifica o agregado antes de desenhar coleções
- [ ] Você decide embed ou referência por acesso, cardinalidade e atomicidade
- [ ] Você explica o custo de consistência entre documentos referenciados
- [ ] Você reconhece quando o schema flexível virou schema caótico
- [ ] Você sabe quando MongoDB é a ferramenta errada
- [ ] Você valida o schema e versiona mudanças de formato

## Para ir além

- [MongoDB — Data Modeling](https://www.mongodb.com/docs/manual/data-modeling/)
- [MongoDB — Schema Validation](https://www.mongodb.com/docs/manual/core/schema-validation/)
- [Martin Fowler — DDD Aggregate](https://martinfowler.com/bliki/DDD_Aggregate.html)
