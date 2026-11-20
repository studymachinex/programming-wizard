> **Em uma frase:** transação não é "colocar `@Transactional` no service" — é definir onde o estado muda de forma atômica, qual anomalia você aceita e como o schema evolui sem quebrar o deploy anterior.

## O problema

Um endpoint de transferência lê o saldo, subtrai o valor em memória e grava. Duas requisições simultâneas leem 100, cada uma subtrai 10 e ambas gravam 90. O saldo final deveria ser 80, mas é 90: uma escrita sobrescreveu a outra. O teste manual passa porque nunca há concorrência; o incidente aparece no pico.

O segundo problema é o schema. A migração renomeia uma coluna e a versão antiga da aplicação, ainda rodando durante o rollout, começa a falhar com `column does not exist`. O deploy virou uma janela de indisponibilidade porque a mudança não era compatível com as duas versões.

Transações e migrations são o mesmo problema visto de dois ângulos: consistência do estado. Uma protege a linha durante a operação; a outra protege o contrato entre versões.

## Como funciona

**Isolamento.** O padrão do PostgreSQL é `READ COMMITTED`: cada statement vê apenas dados commitados, mas duas leituras na mesma transação podem ver versões diferentes. Anomalias clássicas:

| Nível | Dirty read | Non-repeatable read | Phantom | Uso típico |
|---|---|---|---|---|
| `READ UNCOMMITTED` | possível | possível | possível | quase nunca; o PostgreSQL trata como `READ COMMITTED` |
| `READ COMMITTED` | não | possível | possível | padrão, bom para OLTP |
| `REPEATABLE READ` | não | não | possível* | relatórios e leituras consistentes |
| `SERIALIZABLE` | não | não | não | regras que exigem serialização real; pode abortar |

\* No PostgreSQL, `REPEATABLE READ` também evita phantoms por snapshot, mas pode falhar com erro de serialização. O custo de subir o nível é retry e menor concorrência.

**Lock otimista versus pessimista.** O otimista assume que o conflito é raro: lê a versão, tenta atualizar com `WHERE versao = ?` e falha se alguém mudou no meio. O pessimista trava a linha antes de ler e serializa o acesso. Otimista escala melhor; pessimista é adequado quando a disputa é alta e o trecho é curto, como debitar saldo.

**Deadlock.** Duas transações que travam A e depois B, em ordens opostas, se bloqueiam mutuamente. O banco detecta e aborta uma. A correção é definir uma ordem global de aquisição — normalmente pelo id — e mantê-la em todos os fluxos.

**Flyway.** Cada migration é um arquivo versionado em `src/main/resources/db/migration`. O Quarkus executa na inicialização quando configurado, registra o checksum em `flyway_schema_history` e recusa rodar se um arquivo já aplicado foi alterado. Em produção, `migrate-at-start` é comum, mas exige que a aplicação tenha permissão de DDL e que o rollout não suba várias réplicas migrando ao mesmo tempo — o Flyway usa lock, mas o tempo de boot aumenta.

```java
import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;

@Entity
@Table(name = "conta")
public class Conta extends PanacheEntity {

    @Column(nullable = false, precision = 19, scale = 2)
    public BigDecimal saldo;

    @Version
    public long versao;
}
```

```java
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.LockModeType;
import jakarta.transaction.Transactional;
import java.math.BigDecimal;
import java.util.List;

@ApplicationScoped
public class TransferenciaService {

    @Transactional
    public void transferir(Long origemId, Long destinoId, BigDecimal valor) {
        if (valor.signum() <= 0) {
            throw new IllegalArgumentException("valor deve ser positivo");
        }
        // Trava sempre na mesma ordem para evitar deadlock.
        var ids = List.of(origemId, destinoId).stream().sorted().toList();
        var primeira = Conta.findById(ids.get(0), LockModeType.PESSIMISTIC_WRITE);
        var segunda = Conta.findById(ids.get(1), LockModeType.PESSIMISTIC_WRITE);
        if (primeira == null || segunda == null) {
            throw new IllegalArgumentException("conta inexistente");
        }
        var origem = origemId.equals(ids.get(0)) ? primeira : segunda;
        var destino = origemId.equals(ids.get(0)) ? segunda : primeira;
        if (origem.saldo.compareTo(valor) < 0) {
            throw new IllegalStateException("saldo insuficiente");
        }
        origem.saldo = origem.saldo.subtract(valor);
        destino.saldo = destino.saldo.add(valor);
    }
}
```

O `@Version` entra em ação quando você não usa lock pessimista. O Hibernate inclui a versão no `UPDATE`; se nenhuma linha for afetada, lança `OptimisticLockException`. A aplicação decide se repete a operação, devolve `409 Conflict` ou pede ao cliente para recarregar.

```java
@Transactional
public void creditar(Long contaId, BigDecimal valor) {
    var conta = Conta.<Conta>findById(contaId);
    if (conta == null) {
        throw new IllegalArgumentException("conta inexistente");
    }
    conta.saldo = conta.saldo.add(valor);
    // No flush: UPDATE conta SET saldo=?, versao=versao+1 WHERE id=? AND versao=?
    // Zero linhas => OptimisticLockException.
}
```

Para delimitar transação fora do proxy — em um consumidor de fila, por exemplo — use a API programática:

```java
import io.quarkus.narayana.jta.QuarkusTransaction;

QuarkusTransaction.requiringNew().run(() -> {
    // uma nova transação, sem depender de interceptor
});
```

## Na prática

Configuração mínima de persistência e migrations:

```properties
quarkus.datasource.db-kind=postgresql
quarkus.datasource.jdbc.url=jdbc:postgresql://localhost:5432/pedidos
quarkus.datasource.username=pedidos
quarkus.datasource.password=${DB_PASSWORD}
quarkus.datasource.jdbc.transaction-isolation-level=read-committed

quarkus.hibernate-orm.database.generation=validate
quarkus.flyway.migrate-at-start=true
quarkus.flyway.locations=db/migration
quarkus.flyway.baseline-on-migrate=true
```

`database.generation=validate` faz o Hibernate comparar o mapeamento com o schema no boot e falhar se houver divergência. Isso transforma erro de migration em falha de inicialização, não em `SQLException` no meio de uma requisição.

Uma mudança de coluna sem downtime segue expand/contract:

```sql
-- V10: expandir — schema compatível com a versão antiga e a nova
alter table pedido add column status_novo varchar(20);
update pedido set status_novo = status where status_novo is null;

-- A versão nova escreve nos dois campos; a antiga continua lendo "status".

-- V11: contrair — só depois que a versão antiga saiu do rollout
alter table pedido drop constraint pedido_status_check;
alter table pedido drop column status;
alter table pedido rename column status_novo to status;
```

Nunca edite uma migration já aplicada: o checksum muda e o Flyway falha em todos os ambientes. Corrija com uma migration nova. `clean` só existe para desenvolvimento; em produção, ele apaga o schema.

## Armadilhas comuns

- **Autoinvocação de `@Transactional`.** Chamar o método de dentro da mesma classe não passa pelo proxy e nenhuma transação é aberta. Mova o método para outro bean ou use `QuarkusTransaction`.
- **Exceção checada sem rollback.** O JTA marca rollback para `RuntimeException` e `Error`; uma exceção checada pode commitar dados parciais. Use `@Transactional(rollbackOn = Exception.class)` quando o contrato exigir.
- **Transação envolvendo chamada HTTP.** O banco fica travado enquanto o serviço externo responde. Faça a chamada fora da transação ou registre intenção com outbox.
- **Lock pessimista em relatório longo.** Segura linhas por segundos e derruba o throughput. Leia em snapshot ou réplica.
- **Ordem de lock inconsistente.** O deadlock não é aleatório: ele segue a ordem de aquisição. Padronize por id.
- **`@Version` sem tratamento.** `OptimisticLockException` não tratada vira 500. Traduza para 409 e ofereça recarga.
- **Migration destrutiva no mesmo deploy.** Renomear ou remover coluna antes de a versão antiga sair quebra o rollout. Expanda, migre, contraia.

## Checklist de domínio

- [ ] Você explica o que cada nível de isolamento impede e quanto custa
- [ ] Você escolhe entre lock otimista e pessimista pela disputa e pelo tempo do trecho
- [ ] Você padroniza a ordem de aquisição de locks e reconhece um deadlock no log
- [ ] Você usa `@Version` e traduz conflito para 409, não para 500
- [ ] Você escreve migrations expand/contract compatíveis com duas versões
- [ ] Você sabe por que `database.generation=validate` é obrigatório em produção

## Para ir além

- [Quarkus — Hibernate ORM and JPA](https://quarkus.io/guides/hibernate-orm)
- [Quarkus — Flyway](https://quarkus.io/guides/flyway)
- [PostgreSQL — Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [Martin Fowler — Evolutionary Database Design](https://martinfowler.com/articles/evodb.html)
