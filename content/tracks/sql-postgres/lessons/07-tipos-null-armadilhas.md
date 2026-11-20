> **Em uma frase:** tipo é contrato de domínio; escolher `float` para dinheiro ou `timestamp` sem fuso para eventos é uma decisão que o banco vai cobrar em produção.

## O problema

Um relatório financeiro soma R$ 1.000.000,00 em pedidos e fecha com R$ 999.999,97. A diferença de três centavos aparece só em volumes altos. O culpado é `double precision`: valores como `0.10` não têm representação binária exata, e o erro se acumula. Em outro sistema, pedidos criados às 23:30 em São Paulo aparecem no dia seguinte porque a coluna é `timestamp without time zone` e o servidor está em UTC. O código está “certo”; o tipo está errado.

Type choices parecem detalhe de DDL, mas definem o que pode ser armazenado, como o índice se comporta, quanto espaço a linha ocupa e quais bugs são possíveis. Esta aula passa pelos tipos que mais causam incidentes: dinheiro, tempo, texto, booleanos e dados semiestruturados.

## Como funciona

### Dinheiro

`real` e `double precision` são ponto flutuante binário. Eles não representam `0.10` exatamente e não devem ser usados para valores monetários. `numeric(p, s)` é decimal de precisão arbitrária e exato, mas mais lento e maior. `bigint` em centavos é compacto e rápido, mas exige que toda a aplicação saiba a unidade. `money` existe, mas depende de locale e tem comportamento limitado em cálculos; evite em sistemas novos.

```sql
CREATE TABLE pagamentos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
    moeda char(3) NOT NULL DEFAULT 'BRL',
    taxa_percentual numeric(5,2) NOT NULL DEFAULT 0,
    valor_liquido_centavos bigint GENERATED ALWAYS AS (
        valor_centavos - (valor_centavos * taxa_percentual / 100)::bigint
    ) STORED
);
```

O exemplo usa centavos porque o marketplace cobra em BRL e não tem frações de centavo. Se o negócio tiver juros compostos, câmbio ou cripto, `numeric` é mais direto. O importante é escolher uma representação e não misturar. `GENERATED ALWAYS AS ... STORED` calcula na escrita e ocupa espaço; é útil para valores derivados caros, mas não para tudo — um `total` que depende de outra tabela não cabe em generated column.

### Tempo

`timestamptz` guarda um instante absoluto (internamente UTC) e converte para o fuso da sessão na leitura. `timestamp` guarda data e hora “de parede”, sem fuso. `date` guarda só o dia. `interval` guarda durações.

```sql
CREATE TABLE eventos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo text NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now(),
    dia_operacional date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date
);
```

Use `timestamptz` para eventos de sistema, logs, pedidos, pagamentos — qualquer coisa que aconteceu em um instante. Use `date` para “dia fiscal” ou “data de nascimento”. `timestamp` faz sentido para horários locais recorrentes, como “a loja abre às 9h”, mas mesmo aí o fuso precisa estar em outra coluna ou na aplicação. O erro clássico é usar `timestamp` para `criado_em` e depois não saber se o valor é UTC, São Paulo ou o fuso do servidor.

### Texto

`text` é a escolha padrão no PostgreSQL. `varchar(n)` e `char(n)` existem por compatibilidade; `varchar(n)` adiciona uma checagem de tamanho, `char(n)` preenche com espaços e causa comparações estranhas. Se você precisa limitar o tamanho, `CHECK (length(coluna) <= 120)` documenta a regra sem o comportamento de padding. Para identificadores, `citext` pode simplificar comparações case-insensitive, mas exige extensão e tem custo de índice; muitas vezes é melhor normalizar para lowercase na escrita.

`text` com collation `C` ordena por bytes e é rápido, mas não ordena “Álvaro” como um humano espera. Para nomes, use uma collation locale ou `unaccent` em índice de expressão:

```sql
CREATE INDEX idx_clientes_nome_busca
    ON clientes (lower(unaccent(nome)));
```

A extensão `unaccent` precisa ser criada. O índice só será usado se a consulta usar a mesma expressão.

### Booleanos e tri-estado

Um `boolean` nullable tem três estados: `true`, `false` e `NULL`. Se o domínio é “ativo/inativo”, declare `NOT NULL DEFAULT true`. Se o domínio é “sim/não/não informado”, o `NULL` é legítimo — mas deixe isso explícito no nome ou em um comentário, porque a maioria dos bugs vem de tratar `NULL` como `false`.

```sql
CREATE TABLE preferencias (
    cliente_id bigint PRIMARY KEY REFERENCES clientes (id),
    aceita_marketing boolean NOT NULL DEFAULT false,
    aceita_marketing_em timestamptz,
    CONSTRAINT marketing_data_coerente
        CHECK (aceita_marketing OR aceita_marketing_em IS NULL)
);
```

A constraint impede o estado impossível “não aceita, mas tem data de aceite”. Esse tipo de regra é mais valioso que um `boolean` solto.

### JSONB, arrays e extensões

`jsonb` é útil para documentos com schema variável: payload de webhook, atributos de produto que mudam por categoria, configurações. Ele permite indexação GIN e operadores de contenção. O custo é que o banco não valida o formato sem uma constraint ou uma extensão como `pg_jsonschema`, e atualizações reescrevem o documento inteiro.

```sql
CREATE TABLE produtos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome text NOT NULL,
    atributos jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT atributos_e_objeto CHECK (jsonb_typeof(atributos) = 'object')
);

CREATE INDEX idx_produtos_atributos ON produtos USING gin (atributos jsonb_path_ops);
```

Não use JSONB para campos que você filtra, ordena e agrega em todas as queries. `status`, `preco`, `cliente_id` merecem colunas tipadas. JSONB é para o que realmente é documento.

### Tipos numéricos e identificadores

`integer` vai até 2.147.483.647. Para IDs de pedidos em um marketplace grande, `bigint` é obrigatório. `smallint` economiza espaço, mas o ganho raramente compensa a restrição. `serial` é um pseudo-tipo antigo que cria uma sequence; prefira `GENERATED ALWAYS AS IDENTITY`, que é SQL padrão e evita que a aplicação insira um valor manual por acidente.

## Na prática

Antes de criar uma coluna, responda quatro perguntas: o valor é exato ou aproximado? Ele representa um instante ou uma hora local? Pode ser desconhecido? Qual o intervalo completo do domínio? As respostas definem o tipo e as constraints.

Um schema de pagamento com tipos defensáveis:

```sql
CREATE TABLE tentativas_pagamento (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pagamento_id bigint NOT NULL REFERENCES pagamentos (id),
    status text NOT NULL CHECK (status IN ('enviada', 'aprovada', 'recusada', 'erro')),
    codigo_resposta text,
    valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
    criado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT resposta_obrigatoria_quando_final
        CHECK (status IN ('enviada') OR codigo_resposta IS NOT NULL)
);
```

A última constraint impede uma tentativa finalizada sem código do provedor. Ela é barata e documenta uma regra que, de outro modo, viveria em um `if` no serviço.

No JDBC, mapeie tipos explicitamente. `getObject(coluna, OffsetDateTime.class)` para `timestamptz`, `getBigDecimal` para `numeric`, `getLong` para `bigint`. Evite `getTimestamp` para `timestamptz`: ele usa o fuso default da JVM e pode converter de forma inesperada.

```java
try (PreparedStatement ps = conn.prepareStatement("""
        INSERT INTO eventos (tipo, criado_em, dia_operacional)
        VALUES (?, ?, ?)
        """)) {
    ps.setString(1, "pedido.criado");
    ps.setObject(2, OffsetDateTime.now(ZoneOffset.UTC));
    ps.setObject(3, LocalDate.now(ZoneId.of("America/Sao_Paulo")));
    ps.executeUpdate();
}
```

## Armadilhas comuns

- **`float` para dinheiro.** O erro aparece em somas grandes e conciliações. Use `numeric` ou inteiros em centavos.
- **`timestamp` para eventos.** Sem fuso, o valor não identifica um instante. Use `timestamptz` e converta na borda.
- **`varchar(255)` por reflexo.** `text` com `CHECK` é mais flexível e não tem o padding de `char(n)`.
- **`NULL` em booleano sem semântica.** Se o domínio é binário, `NOT NULL DEFAULT`; se é tri-estado, documente e teste.

## Checklist de domínio

- [ ] Você escolhe entre `numeric` e centavos com base no domínio, não no hábito.
- [ ] Você explica a diferença entre `timestamptz`, `timestamp` e `date`.
- [ ] Você usa constraints para impedir combinações impossíveis de campos.
- [ ] Você sabe quando JSONB é documento e quando é fuga de modelagem.

## Para ir além

- [PostgreSQL 16 — Data Types](https://www.postgresql.org/docs/16/datatype.html): referência completa de tipos numéricos, data/hora, texto e JSON.
- [PostgreSQL Wiki — Don't Do This](https://wiki.postgresql.org/wiki/Don%27t_Do_This): armadilhas de tipos, `char(n)`, `money` e afins.
- [PostgreSQL 16 — Date/Time Functions](https://www.postgresql.org/docs/16/functions-datetime.html): conversão de fusos, `date_trunc` e intervalos.
