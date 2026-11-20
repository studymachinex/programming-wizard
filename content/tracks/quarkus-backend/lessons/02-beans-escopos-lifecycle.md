> **Em uma frase:** escopo não é etiqueta decorativa: ele define quando a instância nasce, quem compartilha essa instância e em que momento o `@PreDestroy` roda — e o ArC usa proxies para esconder essa decisão de quem injeta.

## O problema

Um bean anotado com o escopo errado funciona no ambiente de desenvolvimento e falha sob concorrência. Um `@RequestScoped` injetado em um singleton pode virar uma referência a um contexto destruído; um `@Dependent` injetado em `@ApplicationScoped` acumula estado até o shutdown; um `@Singleton` que guarda dados mutáveis atende dois usuários com o mesmo carrinho.

O problema piora quando o time não sabe onde colocar inicialização e limpeza. Abrir conexão no construtor, carregar cache em um `@PostConstruct` que depende de request e fechar recurso no `@PreDestroy` de um bean que nunca é destruído são sintomas do mesmo desconhecimento: o ciclo de vida é uma decisão de arquitetura, não um detalhe.

## Como funciona

O CDI separa escopos normais de pseudo-escopos. Escopos normais — `@ApplicationScoped`, `@RequestScoped`, `@SessionScoped`, `@ConversationScoped` — são gerenciados por contexto e injetados por meio de um client proxy. O proxy é um objeto gerado em build time que parece o bean, mas delega cada chamada à instância real do contexto corrente. Isso permite injetar um bean de request em um objeto de vida longa.

Pseudo-escopos — `@Singleton` e `@Dependent` — não usam proxy. A instância é injetada diretamente. `@Singleton` produz uma única instância por aplicação, sem a flexibilidade de contexto do `@ApplicationScoped`; `@Dependent` produz uma instância por ponto de injeção, e o ciclo de vida dela pertence ao bean que a injetou.

| Escopo | Proxy | Instância | Uso típico | Cuidado |
|---|---|---|---|---|
| `@ApplicationScoped` | Sim | Uma por aplicação | Serviços, clientes HTTP, configuração | Estado mutável compartilhado |
| `@Singleton` | Não | Uma por aplicação | Beans simples, sem interceptação complexa | Sem proxy, injeção direta |
| `@RequestScoped` | Sim | Uma por requisição HTTP | Contexto do usuário, correlação | Não use em thread sem request ativo |
| `@Dependent` | Não | Uma por ponto de injeção | Decorators, composição, `Instance` | Vive junto com quem injetou |

Callbacks: `@PostConstruct` roda depois da injeção e antes do bean ser entregue; `@PreDestroy` roda quando o contexto dono é destruído. Em `@ApplicationScoped`, isso significa o shutdown da aplicação. Em `@RequestScoped`, o fim da requisição. Em `@Dependent`, o fim do bean que o injetou — e se esse bean for um singleton, o dependente só morre no shutdown.

Um `@Dependent` injetado em `@ApplicationScoped` parece um vazamento, mas é comportamento definido: existe uma instância para aquele ponto de injeção, criada junto com o dono e destruída junto com ele. Já um `@Dependent` obtido de `Instance<T>` deve ser destruído manualmente com `instance.destroy(bean)`, senão fica até o fim do contexto que o criou.

Para inicialização global, o Quarkus oferece dois caminhos. `@Startup` em um bean força a instanciação no boot. Observadores de `StartupEvent` e `ShutdownEvent` permitem rodar código uma vez, sem amarrar isso ao construtor de um serviço. O evento de shutdown roda enquanto a aplicação ainda aceita o ciclo de desligamento — mas não bloqueie indefinidamente: requisições em voo têm um timeout próprio.

## Na prática

Um cache de catálogo que carrega no boot e fecha no shutdown:

```java
package com.exemplo.catalogo;

import io.quarkus.runtime.ShutdownEvent;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.ConcurrentHashMap;

@ApplicationScoped
public class CacheCatalogo {

    private final ConcurrentHashMap<String, Produto> produtos = new ConcurrentHashMap<>();

    void aoSubir(@Observes StartupEvent event) {
        produtos.put("p-1", new Produto("p-1", "Teclado", 24990));
    }

    void aoDescer(@Observes ShutdownEvent event) {
        produtos.clear();
    }

    public Produto porId(String id) {
        return produtos.get(id);
    }
}
```

O mesmo efeito com `@Startup` e `@PostConstruct`, útil quando o bean precisa estar instanciado mesmo sem ser injetado:

```java
package com.exemplo.catalogo;

import io.quarkus.runtime.Startup;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;

@Startup
@ApplicationScoped
public class AquecedorDeCache {

    private final ClienteCatalogo cliente;

    public AquecedorDeCache(ClienteCatalogo cliente) {
        this.cliente = cliente;
    }

    @PostConstruct
    void carregar() {
        cliente.aquecer();
    }

    @PreDestroy
    void liberar() {
        cliente.fechar();
    }
}
```

O caso que mais confunde: um `@Dependent` com estado injetado em um serviço `@ApplicationScoped`. A instância é criada uma vez, no início, e o `@PreDestroy` dela só roda quando a aplicação desce. Se você esperava uma instância por chamada, o estado vaza entre requisições. A correção é injetar `Instance<Recurso>` e obter/destruir por operação, ou mudar o escopo para `@RequestScoped` quando existe request.

## Armadilhas comuns

- **Usar `@Singleton` por achar que é “mais leve”.** Sem proxy, a instância é resolvida na injeção, não por contexto; `@ApplicationScoped` é o padrão para serviços.
- **Guardar estado de usuário em bean de aplicação.** O campo é compartilhado por todas as requisições; use `@RequestScoped` ou passe o estado como parâmetro.
- **Achar que `@PreDestroy` de `@Dependent` roda a cada uso.** Ele roda quando o dono é destruído; em singleton, no shutdown.
- **Acessar `@RequestScoped` em thread assíncrona.** O contexto não propaga sozinho; ative-o com `@ActivateRequestContext` ou capture os dados antes.
- **Bloquear no `ShutdownEvent`.** O desligamento tem janela; trabalho longo precisa ser cancelável ou idempotente.

## Checklist de domínio

- [ ] Você escolhe entre `@ApplicationScoped` e `@Singleton` sabendo o efeito do proxy
- [ ] Você sabe quando `@PostConstruct`, `@PreDestroy`, `@Startup` e os eventos rodam
- [ ] Você explica por que um `@Dependent` em singleton vive até o shutdown
- [ ] Você identifica estado mutável indevido em bean compartilhado
- [ ] Você usa `Instance.destroy()` quando cria dependentes manualmente

## Para ir além

- [Quarkus — CDI Reference: scopes and lifecycle](https://quarkus.io/guides/cdi-reference)
- [Quarkus — Application initialization and shutdown events](https://quarkus.io/guides/lifecycle)
- [Jakarta CDI 4.0 — Contexts and Dependency Injection](https://jakarta.ee/specifications/cdi/4.0/)
- [Martin Fowler — Inversion of Control Containers](https://martinfowler.com/articles/injection.html)
