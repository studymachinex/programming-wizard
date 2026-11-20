> **Em uma frase:** interceptores são código gerado na borda do bean: se a chamada não atravessa essa borda, `@Transactional` e qualquer binding são ignorados — e é por isso que autoinvocação é a origem da maioria das transações que “não abrem”.

## O problema

Um método anotado com `@Transactional` deveria abrir transação. Mas ele é chamado por outro método da mesma classe e nada acontece. Em outro caso, uma exceção checada estoura, o cliente recebe erro, e o banco commitou metade da operação. Em um terceiro, um interceptor de auditoria funciona no resource e falha no serviço, e ninguém entende por quê.

A causa comum é tratar anotação como se fosse comportamento do método. Não é: é comportamento do proxy que envolve o bean. Entender onde esse proxy existe — e onde não existe — elimina boa parte do diagnóstico por tentativa e erro.

## Como funciona

O ArC gera, em build time, uma subclasse do bean para cada combinação de escopos e interceptor bindings. Quando outro bean injeta a interface, recebe o proxy. A chamada chega ao proxy, que monta a cadeia de interceptores, executa o `@AroundInvoke` de cada um e só então chama o método real.

A autoinvocação quebra isso porque `this.debitar()` usa a referência do objeto real, não a subclasse. O bytecode gerado não está no caminho. Se já existe uma transação aberta pelo método externo, o trabalho interno participa dela; se o método externo não é transacional, não há transação nenhuma. A anotação interna nunca altera propagação, isolamento ou rollback.

O mesmo vale para métodos `private`, `static`, `final` e construtores. Interceptação CDI exige um método de negócio sobrescrevível. Um método `final` não pode ser sobrescrito pela subclasse; um `private` não é visível a ela. Em vários desses casos o build falha, o que é melhor do que descobrir em produção — mas nem sempre.

`@Transactional` do Jakarta Transactions segue a semântica JTA: `RuntimeException` e `Error` marcam rollback; exceções checadas fazem commit, a menos que você declare `rollbackOn`. `dontRollbackOn` tem precedência quando as duas se aplicam. Coloque a anotação no serviço, não no resource: o limite transacional deve cobrir a regra de negócio, não a serialização HTTP.

| Chamada | Passa pelo proxy? | Interceptor aplica? |
|---|---|---|
| De outro bean para o bean | Sim | Sim |
| `this.metodo()` na mesma classe | Não | Não |
| Método `private` | Não | Não |
| Método `final` ou `static` | Não | Não |
| Construtor | Não | Não |
| Método de bean `@Dependent` injetado | Sim, no ponto de injeção | Sim |

A ordem também importa. Para interceptores, `@Priority` menor executa primeiro; a pilha é montada em ordem crescente e desmontada na volta. Para `@Alternative`, a regra é outra: maior prioridade vence a seleção. Não confunda os dois usos.

Quando o proxy não serve, o Quarkus oferece demarcação programática com `QuarkusTransaction`. `requiringNew()` abre uma transação nova, independente da externa; se a externa der rollback, a interna permanece. É a ferramenta certa para auditoria, outbox e registros que precisam sobreviver à falha do fluxo principal — e uma péssima ideia para esconder um limite mal desenhado.

## Na prática

Um binding de auditoria com ordem explícita:

```java
package com.exemplo.auditoria;

import jakarta.annotation.Priority;
import jakarta.interceptor.AroundInvoke;
import jakarta.interceptor.Interceptor;
import jakarta.interceptor.InterceptorBinding;
import jakarta.interceptor.InvocationContext;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.jboss.logging.Logger;

@InterceptorBinding
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface Auditavel {
}

@Auditavel
@Interceptor
@Priority(Interceptor.Priority.APPLICATION + 100)
public class AuditoriaInterceptor {

    private static final Logger LOG = Logger.getLogger(AuditoriaInterceptor.class);

    @AroundInvoke
    Object registrar(InvocationContext ctx) throws Exception {
        long inicio = System.nanoTime();
        try {
            return ctx.proceed();
        } finally {
            LOG.infof("operacao=%s duracao_ns=%d",
                ctx.getMethod().getName(), System.nanoTime() - inicio);
        }
    }
}
```

O serviço abaixo mostra os dois lados: o método público externo abre transação, mas a chamada interna a `debitar` não passa pelo proxy. A anotação de `debitar` é ignorada; o código roda na transação de `transferir`.

```java
package com.exemplo.conta;

import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

@ApplicationScoped
public class TransferenciaService {

    private final ContaRepository contas;
    private final AuditoriaRepository auditoria;

    public TransferenciaService(ContaRepository contas, AuditoriaRepository auditoria) {
        this.contas = contas;
        this.auditoria = auditoria;
    }

    @Transactional(rollbackOn = SaldoInsuficienteException.class)
    public void transferir(Long origem, Long destino, long centavos) {
        debitar(origem, centavos);   // this.debitar: sem proxy
        creditar(destino, centavos); // this.creditar: sem proxy
        registrarAuditoria(origem, destino, centavos);
    }

    @Transactional(rollbackOn = SaldoInsuficienteException.class)
    void debitar(Long contaId, long centavos) {
        var conta = contas.findById(contaId);
        conta.debitar(centavos); // lança SaldoInsuficienteException
    }

    @Transactional
    void creditar(Long contaId, long centavos) {
        contas.findById(contaId).creditar(centavos);
    }

    void registrarAuditoria(Long origem, Long destino, long centavos) {
        // Transação separada: sobrevive ao rollback da transferência.
        QuarkusTransaction.requiringNew().run(() ->
            auditoria.persist(new Auditoria(origem, destino, centavos)));
    }
}
```

Aqui, `transferir` é o limite transacional. `debitar` e `creditar` internos não abrem nada novo, mas fazem parte da mesma transação. Já a auditoria usa transação própria; se o crédito falhar depois, o registro permanece para investigação.

Em um job agendado, não existe request HTTP. Se o método precisa de beans `@RequestScoped`, ative o contexto explicitamente:

```java
@Scheduled(every = "1h")
@ActivateRequestContext
void reconciliar() {
    conciliacao.executar();
}
```

## Armadilhas comuns

- **Autoinvocação.** `this.metodo()` não passa pelo proxy. Mova o método para outro bean ou use `QuarkusTransaction` de forma consciente.
- **Exceção checada sem `rollbackOn`.** O commit acontece e o cliente vê erro com dados persistidos.
- **Capturar a exceção dentro do método.** O interceptor não vê a falha e faz commit; se precisar continuar, marque rollback explicitamente.
- **Transação em volta de chamada HTTP.** Conexão e locks ficam presos enquanto o parceiro responde; separe o efeito local do efeito remoto.
- **Abusar de `REQUIRES_NEW`.** Cada transação nova pega outra conexão do pool; sob carga, isso esgota o pool e cria deadlock.

## Checklist de domínio

- [ ] Você explica por que autoinvocação ignora `@Transactional`
- [ ] Você sabe quais métodos não podem ser interceptados e por quê
- [ ] Você configura `rollbackOn` para exceções checadas relevantes
- [ ] Você usa `QuarkusTransaction` quando o limite precisa ser explícito
- [ ] Você posiciona o interceptor na camada certa e entende a ordem por `@Priority`

## Para ir além

- [Quarkus — CDI Reference: Interceptors](https://quarkus.io/guides/cdi-reference#interceptors)
- [Quarkus — Using transactions in Quarkus](https://quarkus.io/guides/transaction)
- [Jakarta Transactions 2.0 Specification](https://jakarta.ee/specifications/transactions/2.0/)
- [Martin Fowler — Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html)
