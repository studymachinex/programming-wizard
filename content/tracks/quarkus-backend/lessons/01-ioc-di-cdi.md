> **Em uma frase:** o ArC não injeta mágica em runtime: ele lê o seu código durante o build, decide o grafo de beans e gera bytecode para que injeção e interceptação custem quase nada quando a aplicação sobe.

## O problema

O jeito tradicional de montar um serviço Java produz acoplamento invisível. Cada classe instancia suas dependências com `new`, escolhe a implementação concreta, decide a URL do banco e cria o client HTTP. Quando você precisa testar a regra de negócio, descobre que ela arrasta um banco, um cliente SOAP e uma configuração de ambiente junto. Trocar um detalhe — um cache, um provedor de pagamento — vira cirurgia em vários arquivos.

Inversão de controle resolve isso invertendo a responsabilidade: em vez de a classe buscar suas dependências, alguém entrega. Esse alguém é o container CDI. Injeção de dependência é o mecanismo de entrega; IoC é a inversão de quem controla a construção. O container também decide escopo, ciclo de vida e interceptores — e é aí que ele começa a ditar a arquitetura.

## Como funciona

O Quarkus usa o ArC, uma implementação CDI otimizada para build time. Diferente de containers que leem anotações e resolvem tudo por reflection no startup, o ArC processa os beans durante a compilação: descobre classes com anotações CDI, valida pontos de injeção, resolve ambiguidades e gera as classes de injeção e os proxies. O que sobra em runtime é pouca ou nenhuma reflection.

A descoberta é implícita. Não é preciso `beans.xml`: classes da aplicação com uma anotação de escopo, `@Inject`, produtor, observador ou interceptor binding são candidatas a bean. A ausência de um bean exigido é erro de build, não surpresa em produção. O mesmo vale para duas implementações igualmente qualificadas.

Com um único construtor com parâmetros, o ArC injeta sem `@Inject`. Use isso para manter campos `final` e a classe sempre válida.

| Forma de obter dependência | Teste puro | Diagnóstico | Veredito |
|---|---|---|---|
| Construtor | `new` direto | Falha no build se faltar bean | Preferido |
| Campo com `@Inject` | Exige container ou reflection | Falha no build, mas esconde ciclos | Evitar |
| `Instance<T>` | Precisa de contexto CDI | Resolve em runtime, erro tardio | Só para casos dinâmicos |
| `CDI.current().select()` | Difícil | Service locator disfarçado | Anti-padrão |

Quando há mais de uma implementação, você desempata com um qualificador — uma anotação própria marcada com `@Qualifier`. Um `@Alternative` só é ativado com `@Priority`. Já `@DefaultBean` é o inverso: o bean só vale se nenhum outro bean do mesmo tipo existir, e é pensado para bibliotecas e extensões que oferecem um comportamento padrão.

## Na prática

O serviço abaixo depende de interfaces, não de implementações. O `Clock` vem de um produtor, o que permite congelar o tempo no teste.

```java
package com.exemplo.pagamentos;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import java.time.Clock;

@ApplicationScoped
public class ProcessadorPagamento {

    private final Gateway gateway;
    private final RegistroTransacoes registro;
    private final Clock clock;

    // Único construtor: o ArC injeta sem @Inject.
    public ProcessadorPagamento(Gateway gateway, RegistroTransacoes registro, Clock clock) {
        this.gateway = gateway;
        this.registro = registro;
        this.clock = clock;
    }

    public Recibo processar(Pedido pedido) {
        var autorizacao = gateway.autoriza(pedido.valor(), pedido.moeda());
        var recibo = new Recibo(pedido.id(), autorizacao.id(), clock.instant());
        registro.salvar(recibo);
        return recibo;
    }
}

@ApplicationScoped
class Infraestrutura {

    @Produces
    @ApplicationScoped
    Clock relogio() {
        return Clock.systemUTC();
    }
}
```

Para o cliente HTTP, a interface anotada com `@RegisterRestClient` já é um bean sintetizado. A implementação concreta do gateway apenas delega a ela:

```java
package com.exemplo.pagamentos;

import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;
import org.eclipse.microprofile.rest.client.inject.RestClient;

@RegisterRestClient(configKey = "pagamentos")
@Path("/autorizacoes")
public interface GatewayClient {
    @POST
    Autorizacao autorizar(AutorizacaoRequest request);
}

@ApplicationScoped
public class GatewayHttp implements Gateway {

    private final GatewayClient client;

    public GatewayHttp(@RestClient GatewayClient client) {
        this.client = client;
    }

    @Override
    public Autorizacao autoriza(java.math.BigDecimal valor, String moeda) {
        return client.autorizar(new AutorizacaoRequest(valor, moeda));
    }
}
```

A biblioteca pode oferecer um `@DefaultBean` e a aplicação sobrescrever com `@Alternative @Priority(1)`. Só a alternativa priorizada é ativada; sem `@Priority`, ela é ignorada silenciosamente.

O ganho aparece no teste: a mesma regra roda sem container.

```java
class ProcessadorPagamentoTest {

    @Test
    void registraReciboQuandoGatewayAutoriza() {
        Gateway gateway = (valor, moeda) -> new Autorizacao("auth-123");
        var registro = new RegistroEmMemoria();
        var processador = new ProcessadorPagamento(gateway, registro,
            Clock.fixed(Instant.parse("2026-01-10T12:00:00Z"), ZoneOffset.UTC));

        var recibo = processador.processar(new Pedido("p-1", new BigDecimal("149.90"), "BRL"));

        assertEquals("auth-123", recibo.autorizacaoId());
        assertEquals(1, registro.total());
    }
}
```

`Instance<T>` serve quando a escolha depende de dados em runtime, como selecionar um provedor pelo nome do tenant: `instance.stream().filter(...).findFirst()`. Chame `.isResolvable()` antes de `.get()` e trate a ausência como fluxo de negócio, não como exceção inesperada.

## Armadilhas comuns

- **Injeção por campo em código novo.** Funciona, mas impede `final`, permite objeto meio construído em teste e esconde ciclos de dependência.
- **`@Alternative` sem `@Priority`.** O bean simplesmente não é selecionado e você perde meia hora achando que o build está errado.
- **`@DefaultBean` no próprio app.** Ele deve ficar na biblioteca que oferece o padrão; se a aplicação anota o bean dela, a semântica fica confusa.
- **`Instance.get()` sem verificar.** Dispara `UnsatisfiedResolutionException` no meio da requisição, quando a validação poderia ter ocorrido no build.
- **Service locator dentro de regra de negócio.** `CDI.current().select()` esconde dependências e o compilador deixa de ajudar.

## Checklist de domínio

- [ ] Você explica a diferença entre IoC, injeção de dependência e container CDI
- [ ] Você sabe que o ArC valida o grafo no build e não no primeiro request
- [ ] Você resolve ambiguidade com qualificador, `@Alternative @Priority` ou `@DefaultBean` conforme o caso
- [ ] Você escreve um teste de regra de negócio com `new`, sem subir a aplicação
- [ ] Você identifica e remove um service locator do seu código

## Para ir além

- [Quarkus — Introduction to CDI](https://quarkus.io/guides/cdi)
- [Quarkus — CDI Reference (ArC)](https://quarkus.io/guides/cdi-reference)
- [Jakarta CDI 4.0 Specification](https://jakarta.ee/specifications/cdi/4.0/)
- [Martin Fowler — Inversion of Control Containers and the Dependency Injection pattern](https://martinfowler.com/articles/injection.html)
