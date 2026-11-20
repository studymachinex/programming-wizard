> **Em uma frase:** DIP faz a regra de negócio depender de contratos que ela mesma define, deixando banco, HTTP e SMTP do lado de fora — e testáveis por substituição.

## O problema

O caso de uso `CriarPedido` começa com `new RepositorioPostgres()` e `new SmtpEmail()` no meio do método. Funciona em produção e é impossível de testar sem infraestrutura. Para validar que o pedido é salvo antes de notificar, alguém sobe um Postgres local e um servidor SMTP falso. O teste leva segundos, falha por porta ocupada e não roda no CI sem Docker.

O segundo sintoma aparece quando o banco muda: o domínio precisa ser recompilado com o driver novo, mesmo que a regra "salvar e depois notificar" não tenha mudado. A política de alto nível depende do detalhe de baixo nível. DIP propõe inverter essa seta.

## Como funciona

Três conceitos costumam ser misturados:

| Conceito | O que é | Exemplo |
|---|---|---|
| Inversão de controle (IoC) | Ceder o controle do fluxo a um framework ou callback | Quarkus chamando seu resource; `Comparator` chamado pelo `sort` |
| Injeção de dependência (DI) | Receber colaboradores de fora em vez de criá-los dentro | `new CriarPedido(repo, notificador)` |
| Inversão de dependência (DIP) | Módulos de alto nível e detalhes dependem de abstrações; a abstração pertence ao lado que a consome | `CriarPedido` define `PedidoRepository` |

DI é uma técnica; DIP é um princípio de direção das dependências. Você pode fazer DI sem DIP: injetar `RepositorioPostgres` concreto no construtor continua acoplando o domínio ao Postgres. Também pode aplicar DIP sem framework: passar interfaces no construtor já é suficiente.

O ponto mais importante e menos repetido: **a interface pertence ao consumidor**. `PedidoRepository` é uma necessidade de `CriarPedido`, não uma descrição da tabela `pedido`. Por isso ela fala em `salvar(Pedido)`, não em `insert into`, `@Entity` ou `flush`. Se o formato da interface é ditado pelo banco, você apenas renomeou o acoplamento.

```java
import java.util.List;

record Item(String sku, int quantidade) {}
record Pedido(String cliente, List<Item> itens) {
    Pedido { itens = List.copyOf(itens); }
}

class RepositorioPostgres {
    void salvar(Pedido pedido) {
        // JDBC, SQL e transação omitidos para focar no acoplamento.
        System.out.println("INSERT INTO pedido: " + pedido.cliente());
    }
}

class SmtpEmail {
    void enviar(String destino, String mensagem) {
        System.out.println("SMTP para " + destino + ": " + mensagem);
    }
}

class CriarPedido {
    void executar(Pedido pedido) {
        var repositorio = new RepositorioPostgres();
        repositorio.salvar(pedido);
        new SmtpEmail().enviar(pedido.cliente(), "Pedido criado");
    }
}
```

A classe acima tem duas dependências de infraestrutura escondidas no corpo. O construtor não revela nada, e o teste não consegue substituir nenhuma das duas. Pior: se amanhã o e-mail virar fila, você altera o caso de uso.

A versão seguinte inverte a direção e deixa o caso de uso declarar o que precisa:

```java
import java.util.List;
import java.util.Objects;

record Item(String sku, int quantidade) {}
record Pedido(String cliente, List<Item> itens) {
    Pedido { itens = List.copyOf(itens); }
}

interface PedidoRepository {
    void salvar(Pedido pedido);
}

interface Notificador {
    void enviar(String destino, String mensagem);
}

class CriarPedido {
    private final PedidoRepository repositorio;
    private final Notificador notificador;

    CriarPedido(PedidoRepository repositorio, Notificador notificador) {
        this.repositorio = Objects.requireNonNull(repositorio);
        this.notificador = Objects.requireNonNull(notificador);
    }

    void executar(Pedido pedido) {
        repositorio.salvar(pedido);
        notificador.enviar(pedido.cliente(), "Pedido criado");
    }
}
```

O teste da regra fica trivial e roda em milissegundos:

```java
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CriarPedidoTest {
    @Test
    void salvaAntesDeNotificar() {
        var eventos = new ArrayList<String>();

        PedidoRepository repositorio = pedido -> eventos.add("salvar:" + pedido.cliente());
        Notificador notificador = (destino, mensagem) -> eventos.add("notificar:" + destino);

        new CriarPedido(repositorio, notificador)
                .executar(new Pedido("ana", List.of(new Item("SKU-1", 2))));

        assertEquals(List.of("salvar:ana", "notificar:ana"), eventos);
    }
}
```

Os lambdas são fakes mínimos: registram a ordem das interações. Não há Mockito, banco ou rede. O teste verifica a política "salvar antes de notificar", que é uma decisão do caso de uso, não um detalhe do Postgres.

## Na prática

A composição do grafo fica na borda da aplicação — o `main`, uma classe `@Configuration` ou um módulo de wiring. É o único lugar que conhece as implementações concretas:

```java
public class Aplicacao {
    public static void main(String[] args) {
        PedidoRepository repositorio = new RepositorioPostgres();
        Notificador notificador = new SmtpEmail();
        var criarPedido = new CriarPedido(repositorio, notificador);
        criarPedido.executar(new Pedido("ana", List.of(new Item("SKU-1", 2))));
    }
}
```

Esse código não compila sozinho porque as classes estão em outros arquivos, mas a forma é o que importa: o `main` é o composition root. No Quarkus, o container ArC assume esse papel; em biblioteca, você monta na mão. O erro é usar **service locator** — `Contexto.get(PedidoRepository.class)` dentro do caso de uso — e achar que isso é DIP. A dependência continua escondida e o teste continua precisando configurar um contexto global.

Outro cuidado: interface não é sinônimo de abstração boa. Criar `PedidoRepository` com métodos que espelham o ORM (`saveAndFlush`, `createQuery`) não protege nada. A abstração precisa falar a língua do caso de uso. Também não vale criar interface para toda classe: se existe uma implementação única, sem variação e sem necessidade de isolamento, a interface pode ser ruído. O critério é a direção da dependência e a existência de um cliente que se beneficia da substituição.

E quando **não** aplicar? Em scripts pequenos, protótipos e CRUDs de uma camada, o custo de portas, adapters e wiring pode superar o ganho. DIP é uma ferramenta para isolar políticas que mudam de detalhes que também mudam. Se não há política relevante, não há o que isolar.

## Armadilhas comuns

- **Injetar a implementação concreta.** `CriarPedido(RepositorioPostgres repo)` compila e até parece DI, mas mantém o domínio dependente do banco.
- **Deixar a porta com cara de tabela.** Métodos como `flush`, `merge` e `findByClienteIdAndStatus` vazam o ORM. A porta deve expressar a operação de negócio.
- **Esconder dependências em estáticos.** `Configuracao.getInstance()` dentro do caso de uso é o oposto de DIP; o teste não consegue isolar.
- **Confundir testabilidade com mocks.** Um fake que implementa a porta é mais estável que um mock que verifica chamadas internas. Prefira verificar comportamento observável.

## Checklist de domínio

- [ ] Você diferencia IoC, DI e DIP com um exemplo de cada
- [ ] Você identifica em qual lado a interface deve morar e por quê
- [ ] Você monta o grafo na borda e testa a regra com um fake
- [ ] Você reconhece quando uma interface é só burocracia

## Para ir além

- [Inversion of Control](https://martinfowler.com/bliki/InversionOfControl.html) — a distinção entre o princípio amplo e injeção de dependência.
- [Dependency Inversion Principle](https://www.baeldung.com/java-dependency-inversion-principle) — exemplos Java de portas e adapters.
- [Dependency Injection no Quarkus](https://quarkus.io/guides/cdi-reference) — como o container ArC monta colaboradores por construtor.
