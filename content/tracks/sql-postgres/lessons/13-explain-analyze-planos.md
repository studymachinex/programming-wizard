> **Em uma frase:** `EXPLAIN ANALYZE` não mostra o que o banco "deveria" fazer — mostra o que ele fez, quantas linhas leu e onde o tempo foi gasto.

Ler plano de execução é a habilidade que separa "adicionar índice no chute" de tuning real. O plano revela se o índice foi usado, quantas páginas foram lidas, se houve sort em disco e onde o estimador errou.

## O problema

Uma query lenta recebe um índice na coluna "óbvia". Continua lenta. O plano mostra `Seq Scan` porque a condição aplica uma função na coluna, ou `Nested Loop` com 2 milhões de iterações porque a estimativa de cardinalidade estava errada. Sem ler o plano, você otimiza no escuro.

## Como funciona

`EXPLAIN` estima; `EXPLAIN ANALYZE` executa e mede. Use `BUFFERS` para ver cache hit vs disco:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT c.id, c.nome, sum(p.valor) AS total
FROM clientes c
JOIN pedidos p ON p.cliente_id = c.id
WHERE c.cidade = 'São Paulo'
  AND p.criado_em >= now() - interval '30 days'
GROUP BY c.id, c.nome
ORDER BY total DESC
LIMIT 20;
```

Leia de dentro para fora. Nós comuns:

| Nó | Significado | Sinal de problema |
|---|---|---|
| `Seq Scan` | Varredura completa | Muitas linhas filtradas |
| `Index Scan` | Usa índice e busca heap | Muitas linhas mortas |
| `Index Only Scan` | Só índice | Precisa de visibility map |
| `Nested Loop` | Para cada linha externa, busca interna | Volume alto no lado externo |
| `Hash Join` | Constrói hash da menor relação | Falta de memória |
| `Sort` | Ordenação | `external merge` em disco |

Compare `rows=` estimado com `actual rows=`. Erro de 100x indica estatística desatualizada ou correlação entre colunas. `loops=` multiplica o custo real.

## Na prática

Rode `ANALYZE` após carga grande. Ajuste `work_mem` para sorts/hashes que vazam para disco — mas por sessão, não globalmente sem medir. Crie índice composto na ordem das condições: igualdade, ordenação, faixa.

Em Java, ative log de SQL lento no driver ou no PostgreSQL (`log_min_duration_statement = 200ms`) e capture o plano da query real, com os parâmetros reais. `PreparedStatement` genérico pode escolher plano ruim; teste com `prepareThreshold`.

## Armadilhas comuns

- `EXPLAIN ANALYZE` em `UPDATE/DELETE` sem transação: a alteração acontece.
- Rodar em horário de pico e distorcer a medição.
- Ignorar `Buffers`: disco vs cache muda tudo.
- Achar que todo `Seq Scan` é ruim: tabela pequena ou seletividade baixa justificam.
- Criar índice e não rodar `ANALYZE`.

## Checklist de domínio

- [ ] Leio planos de dentro para fora.
- [ ] Comparo estimado vs real e `loops`.
- [ ] Uso `BUFFERS` e identifico I/O.
- [ ] Sei quando `work_mem` ajuda.
- [ ] Capturo o plano da query de produção.

## Para ir além

Leia "Using EXPLAIN" no manual do PostgreSQL 16 e o guia use-the-index-luke.com. Depois encontre uma query lenta no seu projeto e documente o plano antes/depois.
