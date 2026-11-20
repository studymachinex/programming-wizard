> **Em uma frase:** normalizar é remover dependências que permitem estados contraditórios; desnormalizar é aceitar uma cópia controlada — nunca esquecer que ela existe.

## O problema

O time de logística pede o endereço de entrega de um pedido. O schema atual guarda `cliente_nome`, `cliente_email`, `cliente_cep`, `cliente_cidade` e `cliente_estado` dentro de `pedidos`. Funciona até o cliente mudar de cidade. A partir daí, pedidos antigos passam a mostrar a cidade nova, e o relatório de entregas do mês passado fica impossível de reproduzir. Pior: se o cliente comprar duas vezes no mesmo dia e o atendente corrigir o CEP em um dos pedidos, o mesmo cliente tem dois endereços “atuais” no banco.

Isso é uma anomalia de atualização. Normalização não é uma regra estética para deixar o diagrama bonito; é uma forma de garantir que cada fato seja armazenado uma única vez, no lugar onde ele pode ser atualizado sem contradizer outro fato.

## Como funciona

O ponto de partida é a **dependência funcional**: `X → Y` significa que, para cada valor de `X`, existe no máximo um valor de `Y`. Em `pedidos`, `pedido_id → cliente_id`; em `produtos`, `produto_id → nome`. O processo de normalização pergunta quais dependências existem e se elas estão no lugar certo.

**1FN — atributos atômicos.** Cada coluna guarda um valor indivisível para o domínio. Um campo `telefones` com `"11 99999-1111, 11 98888-2222"` viola 1FN: não dá para indexar, comparar ou remover um telefone sem manipular string. A solução é uma tabela `telefones_cliente`. Cuidado com a leitura errada: 1FN não proíbe `jsonb` ou arrays por si só; ela exige que o banco consiga tratar o valor como um todo. Se você nunca consulta um telefone individual, um array pode ser uma escolha válida — mas você abriu mão de integridade referencial e de buscas eficientes.

**2FN — dependência total da chave.** Vale para chaves compostas. Em `itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)`, `quantidade` depende do par `(pedido_id, produto_id)`. Já `nome_produto` depende apenas de `produto_id`; é uma dependência parcial, então o nome deve ficar em `produtos`.

**3FN — sem dependência transitiva.** Nenhum atributo não-chave deve depender de outro atributo não-chave. Em `clientes (id, cep, cidade, estado)`, `cep → cidade` e `cidade → estado` criam dependências transitivas. O CEP deve ficar em `clientes` ou em uma tabela de endereços; cidade e estado pertencem a uma tabela `ceps` ou `cidades`. Isso evita que dois clientes com o mesmo CEP tenham cidades diferentes por erro de digitação.

Um schema antes, com anomalias:

```sql
CREATE TABLE pedidos_antigos (
    id            bigint PRIMARY KEY,
    cliente_nome  text NOT NULL,
    cliente_email text NOT NULL,
    cliente_cidade text NOT NULL,
    produto_nome  text NOT NULL,
    produto_preco numeric(12,2) NOT NULL,
    quantidade    integer NOT NULL
);
```

Um pedido com três produtos repete nome, e-mail e cidade três vezes. Mudar o e-mail exige atualizar todas as linhas; esquecer uma cria duas versões da verdade. O schema normalizado separa entidades e relações:

```sql
CREATE TABLE clientes (
    id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome  text NOT NULL,
    email text NOT NULL UNIQUE
);

CREATE TABLE enderecos (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cliente_id bigint NOT NULL REFERENCES clientes (id),
    cep        char(8) NOT NULL,
    logradouro text NOT NULL,
    cidade     text NOT NULL,
    estado     char(2) NOT NULL,
    principal  boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX uq_endereco_principal
    ON enderecos (cliente_id)
    WHERE principal;

CREATE TABLE produtos (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome          text NOT NULL,
    preco_centavos bigint NOT NULL CHECK (preco_centavos >= 0)
);

CREATE TABLE pedidos (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cliente_id bigint NOT NULL REFERENCES clientes (id),
    endereco_id bigint NOT NULL REFERENCES enderecos (id),
    criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE itens_pedido (
    pedido_id  bigint NOT NULL REFERENCES pedidos (id),
    produto_id bigint NOT NULL REFERENCES produtos (id),
    quantidade integer NOT NULL CHECK (quantidade > 0),
    preco_unitario_centavos bigint NOT NULL CHECK (preco_unitario_centavos >= 0),
    PRIMARY KEY (pedido_id, produto_id)
);
```

O `endereco_id` no pedido é um snapshot deliberado: o pedido aponta para o endereço usado na entrega, não para o endereço “atual” do cliente. Se o cliente mudar de casa, o pedido antigo continua correto. Isso é uma forma de desnormalização por imutabilidade, não uma violação de 3NF.

O preço unitário em `itens_pedido` também é histórico. O preço do produto pode mudar amanhã; o item precisa preservar o valor cobrado. Repare que `produto_nome` não foi copiado: se o nome mudar, relatórios antigos mostram o nome novo. Para um recibo fiscal, talvez seja necessário copiar também o nome — uma decisão de negócio, não de normalização.

### Quando desnormalizar

Desnormalizar faz sentido quando o custo de leitura é dominante e a consistência pode ser tratada de forma explícita. Três padrões comuns:

| Padrão | O que duplica | Como manter |
|---|---|---|
| Coluna derivada | `total_centavos` em `pedidos` | Trigger, aplicação ou recálculo periódico |
| Read model / CQRS | Tabela pronta para o dashboard | Eventos ou job de sincronização |
| Materialized view | Resultado de uma query pesada | `REFRESH MATERIALIZED VIEW CONCURRENTLY` |

Uma coluna `total_centavos` em `pedidos` evita somar itens em todas as listagens. O risco é divergir dos itens. Se você adotar, trate a coluna como cache: defina a fonte da verdade, escreva testes que comparem `SUM(itens)` com o total e tenha um job de reconciliação. Nunca permita que a aplicação atualize o total e os itens em transações separadas.

```sql
CREATE MATERIALIZED VIEW resumo_vendas_mes AS
SELECT date_trunc('month', criado_em)::date AS mes,
       COUNT(*) AS pedidos,
       SUM(total_centavos) AS receita_centavos
FROM pedidos
WHERE status = 'pago'
GROUP BY 1;

CREATE UNIQUE INDEX ON resumo_vendas_mes (mes);
```

O índice único é obrigatório para `REFRESH MATERIALIZED VIEW CONCURRENTLY`, que não bloqueia leituras. O custo é que o refresh lê a base inteira e mantém uma versão antiga até terminar.

No código Java, o mapeamento entre agregados e linhas precisa respeitar as fronteiras:

```java
public record ItemPedido(long produtoId, int quantidade, long precoUnitarioCentavos) {}

public record Pedido(long id, long clienteId, List<ItemPedido> itens) {
    public long totalCentavos() {
        return itens.stream()
            .mapToLong(i -> i.quantidade() * i.precoUnitarioCentavos())
            .sum();
    }
}
```

Se `Pedido` carrega os itens, o total é derivado, não armazenado no objeto e no banco ao mesmo tempo sem regra. O repositório pode buscar o total persistido para listagens e os itens para o detalhe; a diferença entre os dois é um bug de consistência que precisa ser detectado.

## Na prática

Normalize primeiro; desnormalize com evidência. O fluxo saudável é: schema normalizado, consultas medidas, gargalo identificado, cópia criada com dono e processo de atualização. “Vamos desnormalizar para ficar rápido” sem medir costuma trocar um join barato por um problema de consistência caro.

Para dados semiestruturados, `jsonb` pode ser a escolha certa quando o schema é realmente variável — atributos de um evento, configurações de integração. Mas não use JSONB para evitar decisões de modelagem em campos que você consulta e agrega o tempo todo. Um `payload` é um documento; `status`, `valor` e `cliente_id` são colunas.

## Armadilhas comuns

- **Achar que 1FN proíbe arrays.** Ela exige atomicidade no domínio; arrays e JSONB são válidos quando você trata o valor como um todo e aceita as limitações.
- **Copiar tudo para “desnormalizar”.** Duplicar nome, e-mail e endereço sem plano de atualização é apenas um schemanormalizado com mais passos.
- **Esquecer o snapshot histórico.** Um pedido precisa do endereço e do preço do momento da compra, não dos valores atuais.
- **Criar materialized view sem índice único.** Sem ele, o refresh concorrente não é possível e o dashboard fica bloqueado.

## Checklist de domínio

- [ ] Você identifica dependências parciais e transitivas em um schema existente.
- [ ] Você explica a diferença entre dado atual e snapshot histórico.
- [ ] Você escolhe entre trigger, aplicação e job para manter uma coluna derivada.
- [ ] Você sabe quando uma materialized view é melhor que uma tabela desnormalizada.

## Para ir além

- [PostgreSQL 16 — Constraints](https://www.postgresql.org/docs/16/ddl-constraints.html): como expressar integridade no schema, não só na aplicação.
- [Wikipedia — Database Normalization](https://en.wikipedia.org/wiki/Database_normalization): definições formais de 1FN a BCNF e exemplos.
- [Martin Fowler — CQRS](https://martinfowler.com/bliki/CQRS.html): quando separar leitura e escrita faz sentido e qual o custo.
