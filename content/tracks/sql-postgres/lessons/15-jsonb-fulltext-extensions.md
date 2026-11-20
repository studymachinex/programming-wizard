> **Em uma frase:** JSONB e full-text são ferramentas de busca dentro do PostgreSQL — poderosas, mas com custo de índice e modelagem que você precisa entender antes de abandonar colunas relacionais.

Nem todo dado é tabular. Configurações, atributos variáveis de produto e payloads de evento cabem em JSONB. Texto livre precisa de busca por relevância, não de `LIKE '%termo%'`. O PostgreSQL cobre os dois, mas cada um tem regras próprias.

## O problema

Um catálogo tem atributos diferentes por categoria: tênis têm tamanho e cor; notebooks têm RAM e CPU. Criar 40 colunas nuláveis é ruim; uma tabela EAV é pior para consultar. Já a busca de produtos por descrição com `LIKE` faz `Seq Scan` e ignora acentos e stemming.

## Como funciona

**JSONB** armazena binário, indexável e consultável:

```sql
ALTER TABLE produtos ADD COLUMN atributos jsonb NOT NULL DEFAULT '{}';

CREATE INDEX idx_produtos_atributos ON produtos USING gin (atributos);

SELECT id, nome
FROM produtos
WHERE atributos @> '{"cor": "preto", "tamanho": 42}';

SELECT id, atributos->>'marca' AS marca
FROM produtos
WHERE atributos ? 'marca'
  AND (atributos->>'preco')::numeric < 500;
```

`@>` usa GIN; `->>` extrai texto. Evite aplicar função na coluna indexada sem índice de expressão.

**Full-text** com `tsvector` e `tsquery`:

```sql
ALTER TABLE produtos
  ADD COLUMN busca tsvector
  GENERATED ALWAYS AS (
    to_tsvector('portuguese', coalesce(nome,'') || ' ' || coalesce(descricao,''))
  ) STORED;

CREATE INDEX idx_produtos_busca ON produtos USING gin (busca);

SELECT id, nome,
       ts_rank(busca, websearch_to_tsquery('portuguese', 'monitor 4k')) AS rank
FROM produtos
WHERE busca @@ websearch_to_tsquery('portuguese', 'monitor 4k')
ORDER BY rank DESC
LIMIT 20;
```

Use `unaccent` e um dicionário apropriado se acentos importam. `pg_trgm` ajuda em busca por substring e similaridade.

## Na prática

Modele JSONB para atributos esparsos e payloads que você não filtra com frequência. Se um campo é consultado em todo request, promova-o a coluna. Índices GIN são grandes e mais caros de atualizar; não indexe o documento inteiro sem necessidade.

Em Java, use `PGobject`/`jsonb` no JDBC ou o tipo `JsonNode` do Hibernate 6. Evite serializar string e comparar como texto.

## Armadilhas comuns

- `jsonb` para tudo e perder constraints e joins.
- `LIKE '%x%'` esperando índice B-tree.
- Índice GIN em coluna que muda a cada segundo.
- `to_tsvector` sem idioma/configuração, gerando stemming errado.
- Não rodar `ANALYZE` após carga em JSONB.

## Checklist de domínio

- [ ] Sei quando usar JSONB e quando normalizar.
- [ ] Consulto com `@>`, `?` e `->>`.
- [ ] Crio índice GIN adequado.
- [ ] Implemento full-text com ranking.
- [ ] Conheço `pg_trgm` e `unaccent`.

## Para ir além

Leia os capítulos de JSON Types e Full Text Search do PostgreSQL 16. Depois implemente busca de produtos com ranking e compare com `LIKE`.
